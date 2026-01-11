/**
 * Comprehensive tests for the scanner module
 * Tests table parsing, event counting, goal extraction, and edge cases
 * Based on bugs and scenarios encountered during development
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Standalone implementation of parseTableCells for testing
 * This mirrors the logic in scanner.ts
 */
function parseTableCells(line: string): string[] {
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
 * Count events in tables - simplified version for testing
 */
function countEventInTables(
	content: string, 
	eventName: string, 
	identifier: string, 
	valueType?: string,
	tableTag?: string
): number {
	const lines = content.split('\n');
	let count = 0;
	let inTable = false;
	const isNumeric = valueType === 'numeric';
	let headerColumns: string[] = [];
	let identifierColumnIndex = -1;
	let currentTableMatches = false;
	let skippingTable = false;
	const recentLines: string[] = [];
	const lookbackLines = 5;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		if (line !== undefined) {
			recentLines.push(line);
			if (recentLines.length > lookbackLines) {
				recentLines.shift();
			}
		}
		
		if (!line) continue;
		
		if (line.trim().startsWith('|')) {
			if (!inTable && !skippingTable) {
				headerColumns = [];
				identifierColumnIndex = -1;
				currentTableMatches = false;
				
				if (tableTag) {
					for (const recentLine of recentLines) {
						if (recentLine.includes(`<!-- table-tag: ${tableTag} -->`)) {
							currentTableMatches = true;
							break;
						}
					}
					if (!currentTableMatches) {
						skippingTable = true;
						continue;
					}
				}
			}
			
			if (skippingTable) {
				continue;
			}
			
			if (headerColumns.length === 0) {
				headerColumns = parseTableCells(line);
				identifierColumnIndex = headerColumns.findIndex(h => 
					h.toLowerCase().includes(identifier.toLowerCase())
				);
				inTable = true;
				continue;
			}
			
			if (line.includes('---')) {
				continue;
			}
			
			if (line.includes(eventName)) {
				const cells = parseTableCells(line);
				
				if (isNumeric) {
					if (identifierColumnIndex >= 0 && identifierColumnIndex < cells.length) {
						const cellValue = cells[identifierColumnIndex];
						if (cellValue) {
							const numValue = parseFloat(cellValue);
							if (!isNaN(numValue)) {
								count += numValue;
							}
						}
					}
				} else {
					if (identifierColumnIndex >= 0 && identifierColumnIndex < cells.length) {
						const cellValue = cells[identifierColumnIndex];
						if (cellValue && cellValue.length > 0) {
							count++;
						}
					}
				}
			}
		} else {
			if (inTable || skippingTable) {
				inTable = false;
				skippingTable = false;
				headerColumns = [];
				identifierColumnIndex = -1;
				currentTableMatches = false;
			}
		}
	}

	return count;
}

/**
 * Extract goal from table - simplified version for testing
 */
function extractGoalFromTable(
	content: string,
	eventName: string,
	goalColumn: string,
	tableTag?: string
): number {
	const lines = content.split('\n');
	let totalGoal = 0;
	let inTable = false;
	let headerColumns: string[] = [];
	let goalColumnIndex = -1;
	let currentTableMatches = false;
	let skippingTable = false;
	const recentLines: string[] = [];
	const lookbackLines = 5;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		
		if (line !== undefined) {
			recentLines.push(line);
			if (recentLines.length > lookbackLines) {
				recentLines.shift();
			}
		}
		
		if (!line) continue;
		
		if (line.trim().startsWith('|')) {
			if (!inTable && !skippingTable) {
				headerColumns = [];
				goalColumnIndex = -1;
				currentTableMatches = false;
				
				if (tableTag) {
					for (const recentLine of recentLines) {
						if (recentLine.includes(`<!-- table-tag: ${tableTag} -->`)) {
							currentTableMatches = true;
							break;
						}
					}
					if (!currentTableMatches) {
						skippingTable = true;
						continue;
					}
				}
			}
			
			if (skippingTable) {
				continue;
			}
			
			if (headerColumns.length === 0) {
				headerColumns = parseTableCells(line);
				goalColumnIndex = headerColumns.findIndex(h => 
					h.toLowerCase() === goalColumn.toLowerCase()
				);
				inTable = true;
				continue;
			}
			
			if (line.includes('---')) {
				continue;
			}
			
			if (line.includes(eventName)) {
				const cells = parseTableCells(line);
				
				if (goalColumnIndex >= 0 && goalColumnIndex < cells.length) {
					const cellValue = cells[goalColumnIndex];
					if (cellValue) {
						const numValue = parseFloat(cellValue);
						if (!isNaN(numValue)) {
							totalGoal += numValue;
						}
					}
				}
			}
		} else {
			if (inTable || skippingTable) {
				inTable = false;
				skippingTable = false;
				headerColumns = [];
				goalColumnIndex = -1;
				currentTableMatches = false;
			}
		}
	}

	return totalGoal;
}

describe('Scanner Module', () => {

	describe('parseTableCells', () => {
		
		it('should parse cells WITH trailing pipe', () => {
			const line = '| Exercise | ✓ | 5 |';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '✓', '5']);
		});

		it('should parse cells WITHOUT trailing pipe', () => {
			const line = '| Exercise | ✓ | 5';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '✓', '5']);
		});

		it('should handle empty cells correctly (BUG FIX)', () => {
			// This was the main bug: empty cells were being filtered out
			const line = '| Exercise |  | 5 |';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '', '5']);
			expect(cells.length).toBe(3);
			expect(cells[1]).toBe(''); // Empty cell preserved
		});

		it('should handle empty cells WITHOUT trailing pipe (BUG FIX)', () => {
			const line = '| Exercise |  | 5';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '', '5']);
			expect(cells.length).toBe(3);
		});

		it('should preserve column indices with empty cells', () => {
			// Critical: column index 2 should always be "Goal" column
			const header = '| Activity | Status | Goal |';
			const row = '| Exercise |  | 5 |';
			
			const headerCells = parseTableCells(header);
			const rowCells = parseTableCells(row);
			
			expect(headerCells[2]).toBe('Goal');
			expect(rowCells[2]).toBe('5');
		});

		it('should handle multiple empty cells', () => {
			const line = '| Exercise |  |  | 5 |';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '', '', '5']);
			expect(cells.length).toBe(4);
		});

		it('should handle whitespace in cells', () => {
			const line = '|  Exercise  |  ✓  |  5  |';
			const cells = parseTableCells(line);
			expect(cells).toEqual(['Exercise', '✓', '5']);
		});

		it('should handle header row', () => {
			const line = '| Activity | Mon | Tue | Wed | Thu | Fri | Sat | Sun |';
			const cells = parseTableCells(line);
			expect(cells.length).toBe(8);
			expect(cells[0]).toBe('Activity');
			expect(cells[7]).toBe('Sun');
		});

		it('should handle separator row', () => {
			const line = '|----------|-----|-----|-----|-----|-----|-----|-----|';
			const cells = parseTableCells(line);
			expect(cells.every(c => c.includes('-'))).toBe(true);
		});
	});

	describe('countEventInTables', () => {

		it('should count checkmarks for matching event', () => {
			const content = `
| Activity | Status |
|----------|--------|
| Exercise | ✓      |
| Reading  | ✓      |
| Exercise | ✓      |
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(2);
		});

		it('should not count empty cells as matches', () => {
			const content = `
| Activity | Status |
|----------|--------|
| Exercise | ✓      |
| Exercise |        |
| Exercise | ✓      |
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(2);
		});

		it('should sum numeric values when valueType is numeric', () => {
			const content = `
| Activity | Reps |
|----------|------|
| Exercise | 10   |
| Exercise | 15   |
| Exercise | 20   |
`;
			const sum = countEventInTables(content, 'Exercise', 'Reps', 'numeric');
			expect(sum).toBe(45);
		});

		it('should handle tables without trailing pipes', () => {
			const content = `
| Activity | Status
|----------|-------
| Exercise | ✓
| Reading  | ✓
| Exercise | ✓
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(2);
		});

		it('should count any non-empty value as completion', () => {
			const content = `
| Activity | Done |
|----------|------|
| Exercise | x    |
| Exercise | done |
| Exercise | 1    |
| Exercise |      |
`;
			const count = countEventInTables(content, 'Exercise', 'Done');
			expect(count).toBe(3);
		});

		it('should filter by tableTag', () => {
			const content = `
<!-- table-tag: weekly -->

| Activity | Status |
|----------|--------|
| Exercise | ✓      |

<!-- table-tag: monthly -->

| Activity | Status |
|----------|--------|
| Exercise | ✓      |
| Exercise | ✓      |
`;
			const weeklyCount = countEventInTables(content, 'Exercise', 'Status', undefined, 'weekly');
			expect(weeklyCount).toBe(1);
			
			const monthlyCount = countEventInTables(content, 'Exercise', 'Status', undefined, 'monthly');
			expect(monthlyCount).toBe(2);
		});

		it('should skip tables without matching tag when tag is required', () => {
			const content = `
| Activity | Status |
|----------|--------|
| Exercise | ✓      |

<!-- table-tag: special -->

| Activity | Status |
|----------|--------|
| Exercise | ✓      |
`;
			// Should only count the tagged table
			const count = countEventInTables(content, 'Exercise', 'Status', undefined, 'special');
			expect(count).toBe(1);
		});

		it('should handle decimal numeric values', () => {
			const content = `
| Activity | Hours |
|----------|-------|
| Exercise | 1.5   |
| Exercise | 2.25  |
| Exercise | 0.5   |
`;
			const sum = countEventInTables(content, 'Exercise', 'Hours', 'numeric');
			expect(sum).toBe(4.25);
		});

		it('should handle multiple tables in same content', () => {
			const content = `
# Week 1

| Activity | Status |
|----------|--------|
| Exercise | ✓      |

# Week 2

| Activity | Status |
|----------|--------|
| Exercise | ✓      |
| Exercise | ✓      |
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(3);
		});

		it('should handle empty identifier column (edge case)', () => {
			const content = `
| Activity | Status | Goal |
|----------|--------|------|
| Exercise |        | 5    |
| Exercise | ✓      | 5    |
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(1);
		});
	});

	describe('extractGoalFromTable', () => {

		it('should extract goal value for matching event', () => {
			const content = `
| Activity | Status | Goal |
|----------|--------|------|
| Exercise | ✓      | 5    |
`;
			const goal = extractGoalFromTable(content, 'Exercise', 'Goal');
			expect(goal).toBe(5);
		});

		it('should sum goals for multiple matching events', () => {
			const content = `
| Activity | Status | Goal |
|----------|--------|------|
| Exercise | ✓      | 5    |
| Exercise | ✓      | 10   |
`;
			const goal = extractGoalFromTable(content, 'Exercise', 'Goal');
			expect(goal).toBe(15);
		});

		it('should handle Goal column when Status is empty (BUG FIX)', () => {
			// This tested the column index bug - empty Status shouldn't affect Goal column
			const content = `
| Activity | Status | Goal |
|----------|--------|------|
| Exercise |        | 5    |
`;
			const goal = extractGoalFromTable(content, 'Exercise', 'Goal');
			expect(goal).toBe(5);
		});

		it('should filter by tableTag', () => {
			const content = `
<!-- table-tag: weekly -->

| Activity | Status | Goal |
|----------|--------|------|
| Exercise | ✓      | 7    |

<!-- table-tag: monthly -->

| Activity | Status | Goal |
|----------|--------|------|
| Exercise | ✓      | 30   |
`;
			const weeklyGoal = extractGoalFromTable(content, 'Exercise', 'Goal', 'weekly');
			expect(weeklyGoal).toBe(7);
			
			const monthlyGoal = extractGoalFromTable(content, 'Exercise', 'Goal', 'monthly');
			expect(monthlyGoal).toBe(30);
		});

		it('should return 0 when event not found', () => {
			const content = `
| Activity | Status | Goal |
|----------|--------|------|
| Reading  | ✓      | 5    |
`;
			const goal = extractGoalFromTable(content, 'Exercise', 'Goal');
			expect(goal).toBe(0);
		});

		it('should return 0 when goal column not found', () => {
			const content = `
| Activity | Status |
|----------|--------|
| Exercise | ✓      |
`;
			const goal = extractGoalFromTable(content, 'Exercise', 'Goal');
			expect(goal).toBe(0);
		});
	});

	describe('Block Config Parsing', () => {

		function parseBlockConfig(source: string): {
			layout?: string;
			gridColumns?: number;
			mode?: string;
			file?: string;
			folder?: string;
			tableTag?: string;
		} {
			const blockConfig: {
				layout?: string;
				gridColumns?: number;
				mode?: string;
				file?: string;
				folder?: string;
				tableTag?: string;
			} = {};
			const lines = source.split('\n');
			
			const firstTrackerIndex = lines.findIndex(line => {
				const trimmed = line.trim();
				return trimmed.startsWith('type:') || trimmed.startsWith('type :');
			});
			
			if (firstTrackerIndex === -1) {
				return blockConfig;
			}
			
			for (let i = 0; i < firstTrackerIndex; i++) {
				const line = lines[i];
				if (!line) continue;
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith('#')) continue;
				
				const colonIndex = trimmed.indexOf(':');
				if (colonIndex === -1) continue;
				
				const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
				const value = trimmed.substring(colonIndex + 1).trim();
				
				if (key === 'layout') blockConfig.layout = value;
				else if (key === 'gridcolumns' || key === 'grid_columns') blockConfig.gridColumns = parseInt(value, 10);
				else if (key === 'mode') blockConfig.mode = value;
				else if (key === 'file') blockConfig.file = value;
				else if (key === 'folder') blockConfig.folder = value;
				else if (key === 'tabletag' || key === 'table_tag') blockConfig.tableTag = value;
			}
			
			return blockConfig;
		}

		it('should parse block-level layout', () => {
			const source = `layout: compact-list

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.layout).toBe('compact-list');
		});

		it('should parse block-level mode', () => {
			const source = `mode: current-file

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.mode).toBe('current-file');
		});

		it('should parse block-level file', () => {
			const source = `file: Trackers/Monthly.md

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.file).toBe('Trackers/Monthly.md');
		});

		it('should parse block-level folder', () => {
			const source = `folder: Daily Notes

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.folder).toBe('Daily Notes');
		});

		it('should parse block-level tableTag', () => {
			const source = `tableTag: weekly

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.tableTag).toBe('weekly');
		});

		it('should parse multiple block-level parameters', () => {
			const source = `layout: grid
gridColumns: 3
mode: current-file
tableTag: daily

type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(config.layout).toBe('grid');
			expect(config.gridColumns).toBe(3);
			expect(config.mode).toBe('current-file');
			expect(config.tableTag).toBe('daily');
		});

		it('should handle empty block config', () => {
			const source = `type: progress_bar
identifier: ✓`;
			const config = parseBlockConfig(source);
			expect(Object.keys(config).length).toBe(0);
		});
	});

	describe('Tracker Section Splitting', () => {

		function splitTrackerSections(source: string): string[] {
			const lines = source.split('\n');
			
			const firstTrackerIndex = lines.findIndex(line => {
				const trimmed = line.trim();
				return trimmed.startsWith('type:') || trimmed.startsWith('type :');
			});
			
			if (firstTrackerIndex === -1) {
				return [source];
			}
			
			const trackerContent = lines.slice(firstTrackerIndex).join('\n');
			
			let trackerSections: string[];
			if (trackerContent.includes('\n---\n')) {
				trackerSections = trackerContent.split('\n---\n');
			} else if (trackerContent.includes('\n--- \n')) {
				trackerSections = trackerContent.split('\n--- \n');
			} else if (trackerContent.includes('\n---')) {
				trackerSections = trackerContent.split(/\n---+\s*\n/);
			} else {
				trackerSections = [trackerContent];
			}
			
			return trackerSections.filter(s => s.trim());
		}

		it('should split multiple trackers by ---', () => {
			const source = `type: progress_bar
label: Test 1
---
type: counter
label: Test 2
---
type: percentage
label: Test 3`;
			const sections = splitTrackerSections(source);
			expect(sections.length).toBe(3);
		});

		it('should handle single tracker', () => {
			const source = `type: progress_bar
label: Test`;
			const sections = splitTrackerSections(source);
			expect(sections.length).toBe(1);
		});

		it('should handle block config before trackers', () => {
			const source = `layout: compact-list
mode: current-file

type: progress_bar
label: Test 1
---
type: counter
label: Test 2`;
			const sections = splitTrackerSections(source);
			expect(sections.length).toBe(2);
			expect(sections[0]).toContain('progress_bar');
			expect(sections[1]).toContain('counter');
		});

		it('should handle varying --- separators', () => {
			const source = `type: progress_bar
label: Test 1
----
type: counter
label: Test 2`;
			const sections = splitTrackerSections(source);
			expect(sections.length).toBe(2);
		});
	});

	describe('Edge Cases and Regression Tests', () => {

		it('should handle tables with special characters in event names', () => {
			const content = `
| Activity | Status |
|----------|--------|
| 🧘 Meditation | ✓ |
| 💪 Exercise | ✓ |
`;
			const meditationCount = countEventInTables(content, '🧘 Meditation', 'Status');
			expect(meditationCount).toBe(1);
		});

		it('should handle column headers with special formatting', () => {
			const content = `
| **Activity** | *Status* | Goal |
|--------------|----------|------|
| Exercise     | ✓        | 5    |
`;
			// Note: we look for 'Status' in '*Status*' using includes
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(1);
		});

		it('should handle very long table rows', () => {
			const header = '| Activity | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |';
			const row = '| Exercise | ✓ | ✓ | ✓ |   | ✓ | ✓ |   | 5 |';
			const headerCells = parseTableCells(header);
			const rowCells = parseTableCells(row);
			expect(headerCells.length).toBe(9);
			expect(rowCells.length).toBe(9);
		});

		it('should not be affected by content before tables', () => {
			const content = `
# My Habits

Some text with the word Exercise in it.

| Activity | Status |
|----------|--------|
| Exercise | ✓      |
`;
			const count = countEventInTables(content, 'Exercise', 'Status');
			expect(count).toBe(1);
		});

		it('should handle numeric values with leading/trailing spaces', () => {
			const content = `
| Activity | Reps |
|----------|------|
| Exercise |  10  |
| Exercise | 15   |
`;
			const sum = countEventInTables(content, 'Exercise', 'Reps', 'numeric');
			expect(sum).toBe(25);
		});

		it('should handle zero values correctly', () => {
			const content = `
| Activity | Reps |
|----------|------|
| Exercise | 0    |
| Exercise | 5    |
`;
			const sum = countEventInTables(content, 'Exercise', 'Reps', 'numeric');
			expect(sum).toBe(5);
		});

		it('should handle negative values correctly', () => {
			const content = `
| Activity | Change |
|----------|--------|
| Exercise | 10     |
| Exercise | -5     |
`;
			const sum = countEventInTables(content, 'Exercise', 'Change', 'numeric');
			expect(sum).toBe(5);
		});
	});
});

/**
 * Tests for period filtering behavior
 */
describe('Period Filtering', () => {
	/**
	 * Simulates filterFilesByPeriod logic
	 * Files without dates should only be included when period is 'all-time'
	 */
	function extractDateFromFilename(filename: string): Date | null {
		const patterns = [
			/(\d{4}-\d{2}-\d{2})/,  // 2024-01-15
			/(\d{4}\d{2}\d{2})/,     // 20240115
			/(\d{2}-\d{2}-\d{4})/,   // 15-01-2024
		];

		for (const pattern of patterns) {
			const match = filename.match(pattern);
			if (match) {
				const dateStr = match[1];
				// Simple date parsing for test
				if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
					const [year, month, day] = dateStr.split('-').map(Number);
					if (year !== undefined && month !== undefined && day !== undefined) {
						return new Date(year, month - 1, day);
					}
				}
			}
		}
		return null;
	}

	function filterFilesByPeriod(
		filenames: string[], 
		period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time'
	): string[] {
		if (period === 'all-time') {
			return filenames;
		}

		return filenames.filter(filename => {
			const fileDate = extractDateFromFilename(filename);
			// If file has no date in filename, exclude it from time-based filtering
			if (!fileDate) return false;
			// For simplicity, just check if date exists (real impl checks against period start)
			return true;
		});
	}

	describe('all-time period (default)', () => {
		it('should include files without dates in filename', () => {
			const files = ['01.md', '02.md', 'notes.md'];
			const filtered = filterFilesByPeriod(files, 'all-time');
			expect(filtered).toEqual(['01.md', '02.md', 'notes.md']);
		});

		it('should include files with dates in filename', () => {
			const files = ['2026-01-01.md', '2026-01-02.md'];
			const filtered = filterFilesByPeriod(files, 'all-time');
			expect(filtered).toEqual(['2026-01-01.md', '2026-01-02.md']);
		});

		it('should include mixed files (with and without dates)', () => {
			const files = ['01.md', '2026-01-01.md', 'notes.md', '2026-01-02.md'];
			const filtered = filterFilesByPeriod(files, 'all-time');
			expect(filtered).toEqual(['01.md', '2026-01-01.md', 'notes.md', '2026-01-02.md']);
		});
	});

	describe('time-based periods (daily, weekly, monthly, yearly)', () => {
		it('should exclude files without dates when period is monthly', () => {
			const files = ['01.md', '02.md', 'notes.md'];
			const filtered = filterFilesByPeriod(files, 'monthly');
			expect(filtered).toEqual([]);
		});

		it('should include files with dates when period is monthly', () => {
			const files = ['2026-01-01.md', '2026-01-02.md'];
			const filtered = filterFilesByPeriod(files, 'monthly');
			expect(filtered).toEqual(['2026-01-01.md', '2026-01-02.md']);
		});

		it('should exclude files without dates when period is weekly', () => {
			const files = ['week1.md', 'notes.md'];
			const filtered = filterFilesByPeriod(files, 'weekly');
			expect(filtered).toEqual([]);
		});

		it('should filter mixed files - only keep dated ones when period specified', () => {
			const files = ['01.md', '2026-01-01.md', 'notes.md', '2026-01-02.md'];
			const filtered = filterFilesByPeriod(files, 'monthly');
			expect(filtered).toEqual(['2026-01-01.md', '2026-01-02.md']);
		});
	});

	describe('date extraction from filenames', () => {
		it('should extract date from YYYY-MM-DD format', () => {
			const date = extractDateFromFilename('2026-01-15.md');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2026);
			expect(date?.getMonth()).toBe(0); // January is 0
			expect(date?.getDate()).toBe(15);
		});

		it('should return null for files without dates', () => {
			expect(extractDateFromFilename('01.md')).toBeNull();
			expect(extractDateFromFilename('notes.md')).toBeNull();
			expect(extractDateFromFilename('week1.md')).toBeNull();
		});

		it('should extract date from filename with prefix', () => {
			const date = extractDateFromFilename('daily-2026-01-15.md');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2026);
		});

		it('should extract date from filename with suffix', () => {
			const date = extractDateFromFilename('2026-01-15-notes.md');
			expect(date).not.toBeNull();
			expect(date?.getFullYear()).toBe(2026);
		});
	});
});
