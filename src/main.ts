import { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, HabitTrackerSettingTab } from "./settings";
import { HabitTrackerSettings, TrackerConfig, AggregateMethod } from "./types";
import { FileScanner } from "./utils/scanner";
import { TrackerRenderer } from "./ui/renderer";

export default class HabitTrackerPlugin extends Plugin {
	settings: HabitTrackerSettings;
	private scanner: FileScanner;
	private renderer: TrackerRenderer;
	/** Map of tracker elements to their config and source file path */
	private trackerElements: Map<HTMLElement, { config: TrackerConfig; sourcePath: string }> = new Map();

	async onload() {
		await this.loadSettings();

		// Initialize scanner and renderer
		this.scanner = new FileScanner(this.app.vault);
		this.renderer = new TrackerRenderer();

		// Register the progress-tracker code block processor
		this.registerMarkdownCodeBlockProcessor(
			'progress-tracker',
			this.processTrackerCodeBlock.bind(this)
		);

		// Add settings tab
		this.addSettingTab(new HabitTrackerSettingTab(this.app, this));

		// Listen for file modifications to update trackers
		this.registerEvent(
			this.app.vault.on('modify', () => {
				this.refreshAllTrackers();
			})
		);

		// Listen for file creation
		this.registerEvent(
			this.app.vault.on('create', () => {
				this.refreshAllTrackers();
			})
		);

		// Listen for file deletion
		this.registerEvent(
			this.app.vault.on('delete', () => {
				this.refreshAllTrackers();
			})
		);
	}

	onunload() {
		// Clean up
		this.trackerElements.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<HabitTrackerSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Process a progress-tracker code block
	 */
	private async processTrackerCodeBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): Promise<void> {
		try {
			// Parse block-level config and tracker sections
			const { blockConfig, trackerSections } = this.parseBlockAndTrackers(source);
			
			if (trackerSections.length > 1) {
				// Multiple trackers - create dashboard
				const configs = trackerSections.map(section => this.parseTrackerConfig(section, blockConfig));
				await this.renderDashboard(el, configs, ctx, blockConfig);
			} else {
				// Single tracker
				const config = this.parseTrackerConfig(trackerSections[0] || '', blockConfig);
				await this.renderSingleTracker(el, config, ctx);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			el.createDiv({ cls: 'habit-tracker-error' })
				.textContent = `Error: ${message}`;
			console.error('Habit Tracker error:', error);
		}
	}

	/**
	 * Render a single tracker
	 */
	private async renderSingleTracker(
		el: HTMLElement,
		config: TrackerConfig,
		ctx: MarkdownPostProcessorContext
	): Promise<void> {
		// Get the current file
		const currentFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		const file = currentFile instanceof TFile ? currentFile : undefined;

		// Store the tracker element for later updates (with source path for refresh)
		this.trackerElements.set(el, { config, sourcePath: ctx.sourcePath });

		// Scan files and get data
		const data = await this.scanner.scanFiles(config, file);

		// Render the tracker
		this.renderer.render(el, config.type, data, config.label, config.source);
	}

	/**
	 * Render multiple trackers in a dashboard layout
	 */
	private async renderDashboard(
		el: HTMLElement,
		configs: TrackerConfig[],
		ctx: MarkdownPostProcessorContext,
		blockConfig?: { layout?: string; gridColumns?: number }
	): Promise<void> {
		// Get the current file
		const currentFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		const file = currentFile instanceof TFile ? currentFile : undefined;

		// Use block-level config or defaults
		const layoutMode = blockConfig?.layout || 'grid';
		const gridColumns = blockConfig?.gridColumns || 2;

		// Create container with appropriate class
		let container: HTMLElement;
		if (layoutMode === 'compact-list') {
			container = el.createDiv({ cls: 'habit-tracker-compact-list' });
		} else {
			// Grid layout
			container = el.createDiv({ cls: 'habit-tracker-grid-container' });
			container.setAttribute('data-columns', gridColumns.toString());
		}

		// Render each tracker
		for (const config of configs) {
			const trackerEl = container.createDiv();
			
			// Scan files and get data
			const data = await this.scanner.scanFiles(config, file);
			
			// Render the tracker
			this.renderer.render(trackerEl, config.type, data, config.label, config.source);
			
			// Store for refresh (with source path)
			this.trackerElements.set(trackerEl, { config, sourcePath: ctx.sourcePath });
		}
	}

	/**
	 * Parse block-level config and split tracker sections
	 */
	private parseBlockAndTrackers(source: string): { 
		blockConfig: { layout?: string; gridColumns?: number; source?: string; tableTag?: string }; 
		trackerSections: string[] 
	} {
		const blockConfig: { layout?: string; gridColumns?: number; source?: string; tableTag?: string } = {};
		const lines = source.split('\n');
		
		// Find where the first tracker starts (first line with "type:")
		let firstTrackerIndex = lines.findIndex(line => {
			const trimmed = line.trim();
			return trimmed.startsWith('type:') || trimmed.startsWith('type :');
		});
		
		// If no "type:" found, treat entire source as one tracker
		if (firstTrackerIndex === -1) {
			return { blockConfig, trackerSections: [source] };
		}
		
		// Parse block-level parameters (everything before first "type:")
		for (let i = 0; i < firstTrackerIndex; i++) {
			const line = lines[i];
			if (!line) continue;
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			
			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) continue;
			
			const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
			const value = trimmed.substring(colonIndex + 1).trim();
			
			if (key === 'layout') {
				blockConfig.layout = value;
			} else if (key === 'gridcolumns' || key === 'grid_columns') {
				blockConfig.gridColumns = parseInt(value, 10);
			} else if (key === 'source') {
				blockConfig.source = value;
			} else if (key === 'tabletag' || key === 'table_tag') {
				blockConfig.tableTag = value;
			}
		}
		
		// Get tracker content (from first "type:" onward)
		const trackerContent = lines.slice(firstTrackerIndex).join('\n');
		
		// Split into individual tracker sections
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
		
		trackerSections = trackerSections.filter(s => s.trim());
		
		return { blockConfig, trackerSections };
	}

	/**
	 * Parse tracker configuration from code block content
	 */
	private parseTrackerConfig(
		source: string, 
		blockDefaults?: { source?: string; tableTag?: string }
	): TrackerConfig {
		const lines = source.split('\n');
		const config: Partial<TrackerConfig> = {};

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) continue;

			const key = trimmed.substring(0, colonIndex).trim();
			let value = trimmed.substring(colonIndex + 1).trim();

			// Remove quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			switch (key.toLowerCase()) {
				case 'type':
					config.type = value as TrackerConfig['type'];
					break;
				case 'source':
					config.source = value;
					break;
				case 'tabletag':
				case 'table_tag':
					config.tableTag = value;
					break;
				case 'keycolumn':
				case 'key_column':
					config.keyColumn = value;
					break;
				case 'key':
					config.key = value;
					break;
				case 'valuecolumn':
				case 'value_column':
					config.valueColumn = value;
					break;
				case 'value':
					config.value = value;
					break;
				case 'aggregate':
					config.aggregate = value as AggregateMethod;
					break;
				case 'pattern':
					config.pattern = value;
					break;
				case 'useregex':
				case 'use_regex':
					config.useRegex = value.toLowerCase() === 'true';
					break;
				case 'goal':
					config.goal = parseInt(value, 10);
					break;
				case 'goalcolumn':
				case 'goal_column':
					config.goalColumn = value;
					break;
				case 'period':
					config.period = value as TrackerConfig['period'];
					break;
				case 'label':
					config.label = value;
					break;
				case 'layout':
					config.layout = value as TrackerConfig['layout'];
					break;
				case 'gridcolumns':
				case 'grid_columns':
					config.gridColumns = parseInt(value, 10);
					break;
			}
		}

		// Apply block-level defaults (widget config overrides block defaults)
		if (blockDefaults) {
			if (blockDefaults.source && !config.source) config.source = blockDefaults.source;
			if (blockDefaults.tableTag && !config.tableTag) config.tableTag = blockDefaults.tableTag;
		}

		// Validate required fields
		if (!config.type) {
			throw new Error('Missing required field: type');
		}
		if (!config.source) {
			throw new Error('Missing required field: source (e.g., "current-file", "folder:Daily Notes", "file:path/to/file.md")');
		}

		// Validate source format and extract folder path if needed
		this.validateSource(config.source);

		// Table mode validation
		const isTableMode = config.keyColumn || config.valueColumn;
		if (isTableMode) {
			if (!config.keyColumn) {
				throw new Error('keyColumn is required for table mode');
			}
			if (!config.valueColumn) {
				throw new Error('valueColumn is required for table mode');
			}
			if (!config.value) {
				throw new Error('value is required for table mode (e.g., "numeric", "any", or a text pattern like "✓")');
			}
		}

		// Pattern mode validation
		const isPatternMode = !!config.pattern;
		if (isPatternMode && isTableMode) {
			throw new Error('Cannot use both table mode (keyColumn/valueColumn) and pattern mode (pattern) together');
		}
		if (!isTableMode && !isPatternMode) {
			throw new Error('Either table mode (keyColumn, valueColumn, value) or pattern mode (pattern) must be specified');
		}

		// Set defaults
		if (!config.period) {
			config.period = this.settings.defaultPeriod;
		}
		if (!config.aggregate) {
			config.aggregate = 'count';
		}

		return config as TrackerConfig;
	}

	/**
	 * Validate and parse source format
	 */
	private validateSource(source: string): { type: 'current-file' | 'folder' | 'file'; path?: string } {
		if (source === 'current-file') {
			return { type: 'current-file' };
		}
		if (source.startsWith('folder:')) {
			const path = source.substring(7).trim();
			if (!path) {
				throw new Error('folder source requires a path (e.g., "folder:Daily Notes")');
			}
			return { type: 'folder', path };
		}
		if (source.startsWith('file:')) {
			const path = source.substring(5).trim();
			if (!path) {
				throw new Error('file source requires a path (e.g., "file:path/to/file.md")');
			}
			return { type: 'file', path };
		}
		throw new Error(`Invalid source format: "${source}". Use "current-file", "folder:<path>", or "file:<path>"`);
	}

	/**
	 * Refresh all tracker displays
	 */
	private async refreshAllTrackers(): Promise<void> {
		for (const [el, { config, sourcePath }] of this.trackerElements.entries()) {
			try {
				// Get the file from stored source path
				const currentFile = this.app.vault.getAbstractFileByPath(sourcePath);
				const file = currentFile instanceof TFile ? currentFile : undefined;
				
				const data = await this.scanner.scanFiles(config, file);
				this.renderer.render(el, config.type, data, config.label, config.source);
			} catch (error) {
				console.error('Error refreshing tracker:', error);
			}
		}
	}
}
