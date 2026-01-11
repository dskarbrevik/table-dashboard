/**
 * Types and interfaces for the Habit Progress Tracker plugin
 */

/**
 * Supported tracker visualization types
 */
export type TrackerType = 'progress_bar' | 'counter' | 'percentage' | 'streak' | 'line_plot';

/**
 * Time period for aggregating tracker data.
 * Only applies when source is a folder. Filters files by date extracted from filename (YYYY-MM-DD format).
 */
export type TrackerPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all-time';

/**
 * Aggregation method for values
 */
export type AggregateMethod = 'count' | 'sum' | 'average' | 'max' | 'min';

/**
 * Layout mode for rendering multiple trackers
 */
export type LayoutMode = 'grid' | 'compact-list';

/**
 * Configuration for a progress tracker code block
 */
export interface TrackerConfig {
	/** Type of tracker visualization */
	type: TrackerType;

	// --- Source ---
	/** 
	 * Where to scan for data. Formats:
	 * - "current-file": scan the file containing this block
	 * - "folder:<path>": scan all files in the specified folder
	 * - "file:<path>": scan a specific file
	 */
	source: string;

	// --- Table Mode (structured data from markdown tables) ---
	/** Filter to tables with this HTML comment tag: <!-- table-tag: value --> */
	tableTag?: string;
	/** Column containing row identifiers (required for table mode) */
	keyColumn?: string;
	/** Value to match in keyColumn (optional - omit to include all rows) */
	key?: string;
	/** Column to read values from */
	valueColumn?: string;

	// --- Value Interpretation ---
	/**
	 * What values to look for:
	 * - "numeric": match numbers (integers, decimals)
	 * - "any": match any non-empty cell
	 * - "<text>": match this exact text (e.g., "✓", "done", "yes")
	 */
	value?: string;

	/** How to aggregate matched values (default: "count") */
	aggregate?: AggregateMethod;

	// --- Pattern Mode (scanning file content, not tables) ---
	/** Text pattern to search for in file content */
	pattern?: string;
	/** Enable regex matching for pattern */
	useRegex?: boolean;

	// --- Goal ---
	/** Static goal number */
	goal?: number;
	/** Column name to extract dynamic goal value from (table mode) */
	goalColumn?: string;

	// --- Time Filtering ---
	/** 
	 * Time period for filtering (folder source only).
	 * Requires YYYY-MM-DD format in filenames.
	 */
	period?: TrackerPeriod;

	// --- Display ---
	/** Label to display above the tracker */
	label?: string;

	// --- Block-level (multi-widget dashboards) ---
	/** Layout mode for multi-tracker dashboard: 'grid' (default) or 'compact-list' */
	layout?: LayoutMode;
	/** Number of columns in grid layout (default: 2) */
	gridColumns?: number;
}

/**
 * Result of scanning files for events
 */
export interface TrackerData {
	/** Total count of matched events */
	count: number;
	/** Goal value (if specified) */
	goal?: number;
	/** Number of files scanned */
	filesScanned: number;
	/** Date range of scanned files */
	dateRange: {
		start: Date | null;
		end: Date | null;
	};
	/** Current streak (consecutive days with at least one event) */
	streak?: number;
	/** Numeric sum (when valueType is 'numeric') */
	numericSum?: number;
	/** Time series data for line plots (array of {date, value} points) */
	timeSeries?: Array<{date: Date; value: number}>;
}

/**
 * Settings for the plugin
 */
export interface HabitTrackerSettings {
	/** Default period if not specified in tracker config */
	defaultPeriod: TrackerPeriod;
	/** Date format for parsing daily note titles */
	dateFormat: string;
}
