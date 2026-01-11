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

		// Register the table-dashboard code block processor
		this.registerMarkdownCodeBlockProcessor(
			'table-dashboard',
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
	 * Process a table-dashboard code block
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
			this.renderError(el, message);
			console.error('Table Dashboard error:', error);
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
		
		// Block-level only attributes (not widget-specific)
		const blockOnlyAttrs = ['layout', 'gridcolumns', 'grid_columns'];
		// Attributes that are widget-specific (indicate a tracker section)
		const widgetAttrs = ['type', 'keycolumn', 'key_column', 'valuecolumn', 'value_column', 
			'key', 'value', 'pattern', 'goal', 'goalcolumn', 'goal_column', 'aggregate', 
			'useregex', 'use_regex', 'period', 'label'];
		// Attributes that can be block-level defaults OR widget-specific
		const sharedAttrs = ['source', 'tabletag', 'table_tag'];
		
		// First, check if there are multiple widgets (separated by ---)
		let sections: string[];
		if (source.includes('\n---')) {
			sections = source.split(/\n---+\s*\n?/);
		} else {
			sections = [source];
		}
		sections = sections.filter(s => s.trim());
		
		// If only one section, it's a single widget - no block config parsing needed
		if (sections.length === 1) {
			return { blockConfig, trackerSections: sections };
		}
		
		// Multiple sections - first section may contain block-level config
		// Block-level config is lines that appear BEFORE any widget-specific attr
		const firstSection = sections[0]!;
		const lines = firstSection.split('\n');
		const blockLines: string[] = [];
		const widgetLines: string[] = [];
		let foundWidgetAttr = false;
		
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				// Preserve empty lines and comments in current section
				if (foundWidgetAttr) {
					widgetLines.push(line);
				}
				continue;
			}
			
			const colonIndex = trimmed.indexOf(':');
			if (colonIndex === -1) {
				if (foundWidgetAttr) widgetLines.push(line);
				continue;
			}
			
			const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
			const value = trimmed.substring(colonIndex + 1).trim();
			
			// Check if this is a widget-specific attribute
			if (widgetAttrs.includes(key)) {
				foundWidgetAttr = true;
				widgetLines.push(line);
			} else if (blockOnlyAttrs.includes(key)) {
				// Block-only attribute - always goes to block config
				if (key === 'layout') {
					blockConfig.layout = value;
				} else if (key === 'gridcolumns' || key === 'grid_columns') {
					blockConfig.gridColumns = parseInt(value, 10);
				}
				if (foundWidgetAttr) {
					// Also include in widget in case someone puts it after type:
					widgetLines.push(line);
				}
			} else if (sharedAttrs.includes(key)) {
				// Shared attributes - if before any widget attr, it's block-level default
				if (!foundWidgetAttr) {
					if (key === 'source') {
						blockConfig.source = value;
					} else if (key === 'tabletag' || key === 'table_tag') {
						blockConfig.tableTag = value;
					}
				} else {
					widgetLines.push(line);
				}
			} else {
				// Unknown attribute - include in widget section
				if (foundWidgetAttr) widgetLines.push(line);
			}
		}
		
		// Rebuild tracker sections
		const trackerSections: string[] = [];
		if (widgetLines.length > 0) {
			trackerSections.push(widgetLines.join('\n'));
		}
		// Add remaining sections
		for (let i = 1; i < sections.length; i++) {
			const section = sections[i];
			if (section) {
				trackerSections.push(section);
			}
		}
		
		return { blockConfig, trackerSections: trackerSections.filter(s => s.trim()) };
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
	 * Render a helpful error message with guidance
	 */
	private renderError(el: HTMLElement, message: string): void {
		const errorContainer = el.createDiv({ cls: 'habit-tracker-error' });
		
		// Error header
		const header = errorContainer.createDiv({ cls: 'habit-tracker-error-header' });
		header.createSpan({ cls: 'habit-tracker-error-icon', text: '⚠️' });
		header.createSpan({ cls: 'habit-tracker-error-title', text: 'Configuration Error' });
		
		// Error message
		const messageEl = errorContainer.createDiv({ cls: 'habit-tracker-error-message' });
		messageEl.textContent = message;
		
		// Helpful guidance based on error type
		const guidance = this.getErrorGuidance(message);
		if (guidance) {
			const guidanceEl = errorContainer.createDiv({ cls: 'habit-tracker-error-guidance' });
			guidanceEl.createDiv({ cls: 'habit-tracker-error-guidance-title', text: '💡 How to fix:' });
			const list = guidanceEl.createEl('ul');
			for (const tip of guidance) {
				list.createEl('li', { text: tip });
			}
		}
		
		// Example snippet
		const example = this.getErrorExample(message);
		if (example) {
			const exampleEl = errorContainer.createDiv({ cls: 'habit-tracker-error-example' });
			exampleEl.createDiv({ cls: 'habit-tracker-error-example-title', text: '📋 Example:' });
			const pre = exampleEl.createEl('pre');
			pre.createEl('code', { text: example });
		}
	}

	/**
	 * Get guidance tips based on error message
	 */
	private getErrorGuidance(message: string): string[] | null {
		if (message.includes('Missing required field: type')) {
			return [
				'Add a "type:" line with one of: progress_bar, counter, percentage, streak, line_plot',
				'The type determines how your data is visualized'
			];
		}
		if (message.includes('Missing required field: source')) {
			return [
				'Add a "source:" line to specify where to find your data',
				'Use "current-file" to scan the file containing this block',
				'Use "file:path/to/file.md" to scan a specific file',
				'Use "folder:Daily Notes" to scan all files in a folder'
			];
		}
		if (message.includes('keyColumn is required')) {
			return [
				'Add "keyColumn:" with the name of your table\'s identifier column',
				'This is typically the first column (e.g., "Activity", "Task", "Habit")'
			];
		}
		if (message.includes('valueColumn is required')) {
			return [
				'Add "valueColumn:" with the name of the column to read values from',
				'This is the column containing your data (e.g., "Done", "Status", "Reps")'
			];
		}
		if (message.includes('value is required for table mode')) {
			return [
				'Add "value:" to specify what to look for in cells',
				'Use "✓" or "done" to match specific text',
				'Use "numeric" to extract and aggregate numbers',
				'Use "any" to count any non-empty cell'
			];
		}
		if (message.includes('Either table mode')) {
			return [
				'You must use either Table mode OR Pattern mode',
				'Table mode: add keyColumn, valueColumn, and value',
				'Pattern mode: add pattern (text to search for in files)'
			];
		}
		return null;
	}

	/**
	 * Get an example snippet based on error message
	 */
	private getErrorExample(message: string): string | null {
		if (message.includes('Missing required field: type') || message.includes('Missing required field: source')) {
			return `type: progress_bar
source: current-file
keyColumn: Activity
valueColumn: Done
value: "✓"
goal: 5
label: My Tracker`;
		}
		if (message.includes('keyColumn') || message.includes('valueColumn') || message.includes('value is required')) {
			return `keyColumn: Activity
valueColumn: Done
value: "✓"`;
		}
		if (message.includes('Either table mode')) {
			return `# Table mode:
keyColumn: Activity
valueColumn: Done
value: "✓"

# OR Pattern mode:
pattern: "- [x] Exercise"`;
		}
		return null;
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
