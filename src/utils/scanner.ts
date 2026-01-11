import { TFile, TFolder, Vault, moment } from 'obsidian';
import { TrackerConfig, TrackerData, TrackerPeriod, AggregateMethod } from '../types';

/**
 * Result of extracting values from a table
 */
interface TableExtractionResult {
	values: number[];
	goal?: number;
}

/**
 * Scans vault files and extracts data based on tracker configuration
 */
export class FileScanner {
	constructor(private vault: Vault) {}

	/**
	 * Parse source string into type and optional path
	 */
	private parseSource(source: string): { type: 'current-file' | 'folder' | 'file'; path?: string } {
		if (source === 'current-file') {
			return { type: 'current-file' };
		}
		if (source.startsWith('folder:')) {
			return { type: 'folder', path: source.substring(7).trim() };
		}
		if (source.startsWith('file:')) {
			return { type: 'file', path: source.substring(5).trim() };
		}
		// Fallback - treat as folder path for backward compat
		return { type: 'folder', path: source };
	}

	/**
	 * Scan files based on configuration and return tracker data
	 */
	async scanFiles(config: TrackerConfig, currentFile?: TFile): Promise<TrackerData> {
		const { type, path } = this.parseSource(config.source);

		switch (type) {
			case 'current-file':
				return await this.scanSingleFile(config, currentFile);
			case 'file':
				return await this.scanSpecificFile(config, path!);
			case 'folder':
				return await this.scanFolder(config, path!);
			default: {
				const exhaustiveCheck: never = type;
				throw new Error(`Unknown source type: ${String(exhaustiveCheck)}`);
			}
		}
	}

	/**
	 * Scan a specific file by path
	 */
	private async scanSpecificFile(config: TrackerConfig, filePath: string): Promise<TrackerData> {
		const file = this.vault.getAbstractFileByPath(filePath);
		
		if (!file || !(file instanceof TFile)) {
			console.warn(`File not found: ${filePath}`);
			return this.emptyResult(config);
		}

		return await this.scanSingleFile(config, file);
	}

	/**
	 * Scan a single file (current file or specified file)
	 */
	private async scanSingleFile(config: TrackerConfig, file?: TFile): Promise<TrackerData> {
		if (!file) {
			return this.emptyResult(config);
		}

		const content = await this.vault.cachedRead(file);
		
		// Pattern mode: count text matches in file content
		if (config.pattern) {
			const count = this.countPatternMatches(content, config.pattern, config.useRegex);
			return {
				count,
				goal: config.goal,
				filesScanned: 1,
				dateRange: { start: null, end: null },
				streak: 0
			};
		}

		// Table mode: extract values from markdown tables
		const result = this.extractFromTables(content, config);
		const aggregatedValue = this.aggregate(result.values, config.aggregate || 'count');

		return {
			count: aggregatedValue,
			goal: result.goal ?? config.goal,
			filesScanned: 1,
			dateRange: { start: null, end: null },
			streak: 0,
			numericSum: config.value === 'numeric' ? aggregatedValue : undefined
		};
	}

	/**
	 * Scan all files in a folder
	 */
	private async scanFolder(config: TrackerConfig, folderPath: string): Promise<TrackerData> {
		const files = this.getFilesInFolder(folderPath);
		const filteredFiles = this.filterFilesByPeriod(files, config.period || 'all-time');
		
		const allValues: number[] = [];
		let dynamicGoal = config.goal;
		const dates: Date[] = [];
		const timeSeries: Array<{date: Date; value: number}> = [];

		// Sort files by name (assuming date-based naming)
		const sortedFiles = filteredFiles.sort((a, b) => 
			a.basename.localeCompare(b.basename)
		);

		for (const file of sortedFiles) {
			const content = await this.vault.cachedRead(file);
			let fileValue = 0;

			if (config.pattern) {
				// Pattern mode
				fileValue = this.countPatternMatches(content, config.pattern, config.useRegex);
			} else {
				// Table mode
				const result = this.extractFromTables(content, config);
				fileValue = this.aggregate(result.values, config.aggregate || 'count');
				
				// Use goal from first file that has one
				if (dynamicGoal === undefined && result.goal !== undefined) {
					dynamicGoal = result.goal;
				}
			}

			allValues.push(fileValue);

			// Track dates for streak calculation
			const fileDate = this.extractDateFromFilename(file.basename);
			if (fileValue > 0 && fileDate) {
				dates.push(fileDate);
			}
			
			// Always add to time series for line plots
			if (fileDate) {
				timeSeries.push({ date: fileDate, value: fileValue });
			}
		}

		// Calculate streak
		const streak = dates.length > 0 ? this.calculateStreak(dates) : 0;

		// Aggregate all values across files
		const totalValue = this.aggregate(allValues, config.aggregate || 'count');

		const firstFile = sortedFiles[0];
		const lastFile = sortedFiles[sortedFiles.length - 1];

		return {
			count: totalValue,
			goal: dynamicGoal,
			filesScanned: filteredFiles.length,
			dateRange: {
				start: firstFile ? this.extractDateFromFilename(firstFile.basename) : null,
				end: lastFile ? this.extractDateFromFilename(lastFile.basename) : null
			},
			streak,
			numericSum: config.value === 'numeric' ? totalValue : undefined,
			timeSeries: timeSeries.length > 0 ? timeSeries : undefined
		};
	}

	/**
	 * Create an empty result
	 */
	private emptyResult(config: TrackerConfig): TrackerData {
		return {
			count: 0,
			goal: config.goal,
			filesScanned: 0,
			dateRange: { start: null, end: null },
			streak: 0
		};
	}

	/**
	 * Aggregate an array of values based on the specified method
	 */
	private aggregate(values: number[], method: AggregateMethod): number {
		if (values.length === 0) return 0;

		switch (method) {
			case 'count':
				// Count non-zero values
				return values.filter(v => v > 0).length;
			case 'sum':
				return values.reduce((acc, v) => acc + v, 0);
			case 'average':
				return values.reduce((acc, v) => acc + v, 0) / values.length;
			case 'max':
				return Math.max(...values);
			case 'min':
				return Math.min(...values);
			default:
				return values.reduce((acc, v) => acc + v, 0);
		}
	}

	/**
	 * Count pattern matches in content
	 */
	private countPatternMatches(content: string, pattern: string, useRegex: boolean = false): number {
		if (useRegex) {
			try {
				const regex = new RegExp(pattern, 'g');
				const matches = content.match(regex);
				return matches ? matches.length : 0;
			} catch (e) {
				console.error('Invalid regex pattern:', pattern, e);
				return 0;
			}
		} else {
			// Simple string matching
			const parts = content.split(pattern);
			return parts.length - 1;
		}
	}

	/**
	 * Extract values from markdown tables based on configuration
	 */
	private extractFromTables(content: string, config: TrackerConfig): TableExtractionResult {
		const lines = content.split('\n');
		const values: number[] = [];
		let goal: number | undefined;

		let inTable = false;
		let skippingTable = false;
		let headerColumns: string[] = [];
		let keyColumnIndex = -1;
		let valueColumnIndex = -1;
		let goalColumnIndex = -1;
		const recentLines: string[] = [];
		const lookbackLines = 5;

		for (const line of lines) {
			// Keep track of recent lines for table-tag lookback
			recentLines.push(line);
			if (recentLines.length > lookbackLines) {
				recentLines.shift();
			}

			if (!line) continue;

			// Detect table row (starts with |)
			if (line.trim().startsWith('|')) {
				// New table starting
				if (!inTable && !skippingTable) {
					headerColumns = [];
					keyColumnIndex = -1;
					valueColumnIndex = -1;
					goalColumnIndex = -1;

					// Check for table-tag filter
					if (config.tableTag) {
						let tagFound = false;
						for (const recentLine of recentLines) {
							if (recentLine.includes(`<!-- table-tag: ${config.tableTag} -->`)) {
								tagFound = true;
								break;
							}
						}
						if (!tagFound) {
							skippingTable = true;
							continue;
						}
					}
				}

				if (skippingTable) continue;

				// Parse header row
				if (headerColumns.length === 0) {
					headerColumns = this.parseTableCells(line);
					
					// Find column indices
					keyColumnIndex = headerColumns.findIndex(h => 
						h.toLowerCase() === config.keyColumn?.toLowerCase()
					);
					valueColumnIndex = headerColumns.findIndex(h => 
						h.toLowerCase() === config.valueColumn?.toLowerCase()
					);
					if (config.goalColumn) {
						goalColumnIndex = headerColumns.findIndex(h => 
							h.toLowerCase() === config.goalColumn?.toLowerCase()
						);
					}

					inTable = true;
					continue;
				}

				// Skip separator row
				if (line.includes('---')) continue;

				// Data row
				const cells = this.parseTableCells(line);

				// Check if row matches key filter (if specified)
				if (config.key) {
					if (keyColumnIndex < 0 || keyColumnIndex >= cells.length) continue;
					const keyCell = cells[keyColumnIndex];
					if (!keyCell || !keyCell.includes(config.key)) continue;
				}

				// Extract value from value column
				if (valueColumnIndex >= 0 && valueColumnIndex < cells.length) {
					const cellValue = cells[valueColumnIndex]?.trim() || '';
					const extractedValue = this.extractValue(cellValue, config.value || 'any');
					if (extractedValue !== null) {
						values.push(extractedValue);
					}
				}

				// Extract goal from goal column (if present)
				if (goalColumnIndex >= 0 && goalColumnIndex < cells.length) {
					const goalCell = cells[goalColumnIndex]?.trim() || '';
					const numValue = parseFloat(goalCell);
					if (!isNaN(numValue)) {
						goal = (goal ?? 0) + numValue;
					}
				}
			} else {
				// Non-table row - reset state
				if (inTable || skippingTable) {
					inTable = false;
					skippingTable = false;
					headerColumns = [];
				}
			}
		}

		return { values, goal };
	}

	/**
	 * Extract a value from a cell based on the value type
	 */
	private extractValue(cellValue: string, valueType: string): number | null {
		if (!cellValue) return null;

		switch (valueType) {
			case 'numeric': {
				// Look for numeric values, be resilient to non-numeric content
				const numMatch = cellValue.match(/-?\d+\.?\d*/);
				if (numMatch) {
					const num = parseFloat(numMatch[0]);
					return isNaN(num) ? null : num;
				}
				return null;
			}

			case 'any':
				// Any non-empty cell counts as 1
				return cellValue.length > 0 ? 1 : null;

			default:
				// Exact text match - return 1 if matches, null otherwise
				if (cellValue.includes(valueType)) {
					return 1;
				}
				return null;
		}
	}

	/**
	 * Parse table cells from a markdown table line
	 */
	private parseTableCells(line: string): string[] {
		const rawCells = line.split('|').map(c => c.trim());
		// Remove first empty string (before first |)
		if (rawCells.length > 0 && rawCells[0] === '') {
			rawCells.shift();
		}
		// Remove last empty string (after trailing |) if present
		if (rawCells.length > 0 && rawCells[rawCells.length - 1] === '') {
			rawCells.pop();
		}
		return rawCells;
	}

	/**
	 * Get all markdown files in a folder
	 */
	private getFilesInFolder(folderPath: string): TFile[] {
		const abstractFile = this.vault.getAbstractFileByPath(folderPath);
		
		if (!abstractFile || !(abstractFile instanceof TFolder)) {
			return [];
		}

		const files: TFile[] = [];
		Vault.recurseChildren(abstractFile, (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				files.push(file);
			}
		});

		return files;
	}

	/**
	 * Filter files based on time period (requires YYYY-MM-DD in filename)
	 */
	private filterFilesByPeriod(files: TFile[], period: TrackerPeriod): TFile[] {
		if (period === 'all-time') {
			return files;
		}

		const now = moment();
		const startOfPeriod = this.getStartOfPeriod(now, period);

		return files.filter(file => {
			const fileDate = this.extractDateFromFilename(file.basename);
			// If file has no date in filename, exclude it from time-based filtering
			if (!fileDate) return false;
			return moment(fileDate).isSameOrAfter(startOfPeriod);
		});
	}

	/**
	 * Get the start date for a given period
	 */
	private getStartOfPeriod(now: moment.Moment, period: TrackerPeriod): moment.Moment {
		switch (period) {
			case 'daily':
				return now.clone().startOf('day');
			case 'weekly':
				return now.clone().startOf('week');
			case 'monthly':
				return now.clone().startOf('month');
			case 'yearly':
				return now.clone().startOf('year');
			default:
				return moment(0);
		}
	}

	/**
	 * Extract date from filename (supports YYYY-MM-DD format)
	 */
	private extractDateFromFilename(filename: string): Date | null {
		const patterns = [
			/(\d{4}-\d{2}-\d{2})/,  // 2024-01-15
			/(\d{4}\d{2}\d{2})/,     // 20240115
			/(\d{2}-\d{2}-\d{4})/,   // 15-01-2024
		];

		for (const pattern of patterns) {
			const match = filename.match(pattern);
			if (match) {
				const dateStr = match[1];
				const parsed = moment(dateStr, ['YYYY-MM-DD', 'YYYYMMDD', 'DD-MM-YYYY'], true);
				if (parsed.isValid()) {
					return parsed.toDate();
				}
			}
		}

		return null;
	}

	/**
	 * Calculate current streak (consecutive days with events)
	 */
	private calculateStreak(dates: Date[]): number {
		if (dates.length === 0) return 0;

		// Sort dates in descending order
		const sortedDates = dates
			.map(d => moment(d).startOf('day'))
			.sort((a, b) => b.valueOf() - a.valueOf());

		// Remove duplicates
		const uniqueDates = sortedDates.filter((date, index, array) => 
			index === 0 || !date.isSame(array[index - 1], 'day')
		);

		let streak = 0;
		const today = moment().startOf('day');
		const checkDate = today.clone();

		// Count backwards from today
		for (const date of uniqueDates) {
			if (date.isSame(checkDate, 'day')) {
				streak++;
				checkDate.subtract(1, 'day');
			} else if (date.isBefore(checkDate, 'day')) {
				break;
			}
		}

		return streak;
	}
}
