/**
 * Tests for configuration parsing, attribute order independence, and error handling
 * These tests cover the new features added to support flexible attribute ordering
 * and helpful error messages.
 */

import { describe, it, expect } from '@jest/globals';

/**
 * Mirrors the parseBlockAndTrackers logic from main.ts
 */
function parseBlockAndTrackers(source: string): { 
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
	const firstSection = sections[0]!;
	const lines = firstSection.split('\n');
	const widgetLines: string[] = [];
	let foundWidgetAttr = false;
	
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
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
		
		if (widgetAttrs.includes(key)) {
			foundWidgetAttr = true;
			widgetLines.push(line);
		} else if (blockOnlyAttrs.includes(key)) {
			if (key === 'layout') {
				blockConfig.layout = value;
			} else if (key === 'gridcolumns' || key === 'grid_columns') {
				blockConfig.gridColumns = parseInt(value, 10);
			}
			if (foundWidgetAttr) {
				widgetLines.push(line);
			}
		} else if (sharedAttrs.includes(key)) {
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
			if (foundWidgetAttr) widgetLines.push(line);
		}
	}
	
	const trackerSections: string[] = [];
	if (widgetLines.length > 0) {
		trackerSections.push(widgetLines.join('\n'));
	}
	for (let i = 1; i < sections.length; i++) {
		const section = sections[i];
		if (section) {
			trackerSections.push(section);
		}
	}
	
	return { blockConfig, trackerSections: trackerSections.filter(s => s.trim()) };
}

/**
 * Mirrors the parseTrackerConfig logic from main.ts
 */
function parseTrackerConfig(
	source: string, 
	blockDefaults?: { source?: string; tableTag?: string }
): Record<string, unknown> {
	const lines = source.split('\n');
	const config: Record<string, unknown> = {};

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
				config.type = value;
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
				config.aggregate = value;
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
				config.period = value;
				break;
			case 'label':
				config.label = value;
				break;
			case 'layout':
				config.layout = value;
				break;
			case 'gridcolumns':
			case 'grid_columns':
				config.gridColumns = parseInt(value, 10);
				break;
		}
	}

	// Apply block-level defaults
	if (blockDefaults) {
		if (blockDefaults.source && !config.source) config.source = blockDefaults.source;
		if (blockDefaults.tableTag && !config.tableTag) config.tableTag = blockDefaults.tableTag;
	}

	return config;
}

/**
 * Validate config and return error message if invalid
 */
function validateConfig(config: Record<string, unknown>): string | null {
	if (!config.type) {
		return 'Missing required field: type';
	}
	if (!config.source) {
		return 'Missing required field: source';
	}

	// Validate source format
	const source = config.source as string;
	if (source !== 'current-file' && !source.startsWith('folder:') && !source.startsWith('file:')) {
		return `Invalid source format: "${source}". Use "current-file", "folder:<path>", or "file:<path>"`;
	}

	// Table mode validation
	const isTableMode = config.keyColumn || config.valueColumn;
	if (isTableMode) {
		if (!config.keyColumn) {
			return 'keyColumn is required for table mode';
		}
		if (!config.valueColumn) {
			return 'valueColumn is required for table mode';
		}
		if (!config.value) {
			return 'value is required for table mode';
		}
	}

	// Pattern mode validation
	const isPatternMode = !!config.pattern;
	if (isPatternMode && isTableMode) {
		return 'Cannot use both table mode and pattern mode together';
	}
	if (!isTableMode && !isPatternMode) {
		return 'Either table mode or pattern mode must be specified';
	}

	return null;
}

describe('Config Parsing - Attribute Order Independence', () => {

	describe('Single Widget - Type First (traditional)', () => {
		it('should parse config with type first', () => {
			const source = `type: counter
source: current-file
keyColumn: Activity
valueColumn: Done
value: "✓"
label: Test`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.source).toBe('current-file');
			expect(config.keyColumn).toBe('Activity');
			expect(config.valueColumn).toBe('Done');
			expect(config.value).toBe('✓');
			expect(config.label).toBe('Test');
		});
	});

	describe('Single Widget - Type NOT First', () => {
		it('should parse config with source first', () => {
			const source = `source: current-file
type: counter
keyColumn: Activity
valueColumn: Done
value: "✓"`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.source).toBe('current-file');
		});

		it('should parse config with keyColumn first', () => {
			const source = `keyColumn: Activity
valueColumn: Done
value: "✓"
type: progress_bar
source: current-file
goal: 5`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('progress_bar');
			expect(config.keyColumn).toBe('Activity');
			expect(config.goal).toBe(5);
		});

		it('should parse config with label first', () => {
			const source = `label: My Tracker
type: counter
source: current-file
keyColumn: Activity
valueColumn: Done
value: any`;
			const config = parseTrackerConfig(source);
			expect(config.label).toBe('My Tracker');
			expect(config.type).toBe('counter');
		});

		it('should parse config with type in middle', () => {
			const source = `source: current-file
keyColumn: Activity
type: percentage
valueColumn: Done
value: "✓"
goal: 10`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('percentage');
			expect(config.goal).toBe(10);
		});

		it('should parse config with type last', () => {
			const source = `source: current-file
keyColumn: Activity
valueColumn: Done
value: numeric
aggregate: sum
label: Total
type: counter`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.aggregate).toBe('sum');
		});
	});

	describe('Multi-Widget Dashboard - Block Config', () => {
		it('should parse block-level config before widgets', () => {
			const source = `layout: compact-list
source: current-file
tableTag: weekly

type: counter
keyColumn: Activity
valueColumn: Done
value: "✓"
---
type: progress_bar
keyColumn: Activity
valueColumn: Done
value: "✓"
goal: 5`;
			const { blockConfig, trackerSections } = parseBlockAndTrackers(source);
			expect(blockConfig.layout).toBe('compact-list');
			expect(blockConfig.source).toBe('current-file');
			expect(blockConfig.tableTag).toBe('weekly');
			expect(trackerSections.length).toBe(2);
		});

		it('should inherit block defaults in widgets', () => {
			const source = `source: current-file
tableTag: daily

type: counter
keyColumn: Activity
valueColumn: Done
value: "✓"
---
type: progress_bar
keyColumn: Task
valueColumn: Status
value: done`;
			const { blockConfig, trackerSections } = parseBlockAndTrackers(source);
			
			const widget1 = parseTrackerConfig(trackerSections[0], blockConfig);
			const widget2 = parseTrackerConfig(trackerSections[1], blockConfig);
			
			expect(widget1.source).toBe('current-file');
			expect(widget1.tableTag).toBe('daily');
			expect(widget2.source).toBe('current-file');
			expect(widget2.tableTag).toBe('daily');
		});

		it('should allow widget to override block defaults', () => {
			const source = `source: current-file
tableTag: weekly

type: counter
keyColumn: Activity
valueColumn: Done
value: "✓"
tableTag: daily
---
type: counter
keyColumn: Activity
valueColumn: Done
value: "✓"`;
			const { blockConfig, trackerSections } = parseBlockAndTrackers(source);
			
			const widget1 = parseTrackerConfig(trackerSections[0], blockConfig);
			const widget2 = parseTrackerConfig(trackerSections[1], blockConfig);
			
			// Widget 1 overrides tableTag
			expect(widget1.tableTag).toBe('daily');
			// Widget 2 inherits from block
			expect(widget2.tableTag).toBe('weekly');
		});
	});

	describe('Alternate Attribute Name Formats', () => {
		it('should accept snake_case attribute names', () => {
			const source = `type: counter
source: current-file
key_column: Activity
value_column: Done
table_tag: weekly
goal_column: Target
use_regex: true
grid_columns: 3`;
			const config = parseTrackerConfig(source);
			expect(config.keyColumn).toBe('Activity');
			expect(config.valueColumn).toBe('Done');
			expect(config.tableTag).toBe('weekly');
			expect(config.goalColumn).toBe('Target');
			expect(config.useRegex).toBe(true);
			expect(config.gridColumns).toBe(3);
		});

		it('should accept camelCase attribute names', () => {
			const source = `type: counter
source: current-file
keyColumn: Activity
valueColumn: Done
tableTag: weekly
goalColumn: Target
useRegex: false
gridColumns: 2`;
			const config = parseTrackerConfig(source);
			expect(config.keyColumn).toBe('Activity');
			expect(config.valueColumn).toBe('Done');
			expect(config.tableTag).toBe('weekly');
			expect(config.goalColumn).toBe('Target');
			expect(config.useRegex).toBe(false);
			expect(config.gridColumns).toBe(2);
		});
	});
});

describe('Config Validation - Error Handling', () => {

	describe('Missing Required Fields', () => {
		it('should error when type is missing', () => {
			const config = {
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBe('Missing required field: type');
		});

		it('should error when source is missing', () => {
			const config = {
				type: 'counter',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBe('Missing required field: source');
		});

		it('should error when keyColumn is missing in table mode', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBe('keyColumn is required for table mode');
		});

		it('should error when valueColumn is missing in table mode', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				keyColumn: 'Activity',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBe('valueColumn is required for table mode');
		});

		it('should error when value is missing in table mode', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Done'
			};
			const error = validateConfig(config);
			expect(error).toBe('value is required for table mode');
		});
	});

	describe('Invalid Source Format', () => {
		it('should error for invalid source string', () => {
			const config = {
				type: 'counter',
				source: 'invalid-source',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toContain('Invalid source format');
		});

		it('should accept current-file source', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});

		it('should accept folder: source', () => {
			const config = {
				type: 'streak',
				source: 'folder:Daily Notes',
				pattern: '- [x] Exercise'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});

		it('should accept file: source', () => {
			const config = {
				type: 'counter',
				source: 'file:Trackers/habits.md',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});
	});

	describe('Mode Conflicts', () => {
		it('should error when neither table nor pattern mode specified', () => {
			const config = {
				type: 'counter',
				source: 'current-file'
			};
			const error = validateConfig(config);
			expect(error).toBe('Either table mode or pattern mode must be specified');
		});

		it('should error when both table and pattern mode specified', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓',
				pattern: '- [x]'
			};
			const error = validateConfig(config);
			expect(error).toBe('Cannot use both table mode and pattern mode together');
		});
	});

	describe('Valid Configurations', () => {
		it('should validate complete table mode config', () => {
			const config = {
				type: 'progress_bar',
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Done',
				value: '✓',
				goal: 5,
				label: 'Exercise Progress'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});

		it('should validate complete pattern mode config', () => {
			const config = {
				type: 'streak',
				source: 'folder:Daily Notes',
				pattern: '- [x] Meditation',
				period: 'monthly',
				label: 'Meditation Streak'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});

		it('should validate numeric value type config', () => {
			const config = {
				type: 'counter',
				source: 'current-file',
				keyColumn: 'Activity',
				valueColumn: 'Reps',
				value: 'numeric',
				aggregate: 'sum'
			};
			const error = validateConfig(config);
			expect(error).toBeNull();
		});
	});
});

describe('Edge Cases', () => {

	describe('Whitespace Handling', () => {
		it('should handle extra whitespace around values', () => {
			const source = `type:   counter  
source:  current-file  
keyColumn:   Activity  
valueColumn:   Done  
value:   "✓"  `;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.source).toBe('current-file');
			expect(config.keyColumn).toBe('Activity');
		});

		it('should handle tabs in config', () => {
			const source = `type:\tcounter
source:\tcurrent-file
keyColumn:\tActivity`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
		});
	});

	describe('Quote Handling', () => {
		it('should strip double quotes from values', () => {
			const source = `type: counter
source: current-file
keyColumn: "Activity"
valueColumn: "Done"
value: "✓"`;
			const config = parseTrackerConfig(source);
			expect(config.keyColumn).toBe('Activity');
			expect(config.value).toBe('✓');
		});

		it('should strip single quotes from values', () => {
			const source = `type: counter
source: current-file
value: '✓'`;
			const config = parseTrackerConfig(source);
			expect(config.value).toBe('✓');
		});

		it('should preserve quotes if not matching', () => {
			const source = `type: counter
source: current-file
label: "Unmatched quote`;
			const config = parseTrackerConfig(source);
			expect(config.label).toBe('"Unmatched quote');
		});
	});

	describe('Empty and Comment Lines', () => {
		it('should skip empty lines', () => {
			const source = `type: counter

source: current-file

keyColumn: Activity
valueColumn: Done
value: "✓"`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.keyColumn).toBe('Activity');
		});

		it('should skip comment lines', () => {
			const source = `# This is a comment
type: counter
# Another comment
source: current-file
keyColumn: Activity
valueColumn: Done
value: "✓"`;
			const config = parseTrackerConfig(source);
			expect(config.type).toBe('counter');
			expect(config.source).toBe('current-file');
		});
	});

	describe('Separator Variations', () => {
		it('should handle --- separator', () => {
			const source = `layout: grid

type: counter
keyColumn: A
valueColumn: B
value: x
---
type: counter
keyColumn: C
valueColumn: D
value: y`;
			const { trackerSections } = parseBlockAndTrackers(source);
			expect(trackerSections.length).toBe(2);
		});

		it('should handle ---- (multiple dashes) separator', () => {
			const source = `layout: grid

type: counter
keyColumn: A
valueColumn: B
value: x
----
type: counter
keyColumn: C
valueColumn: D
value: y`;
			const { trackerSections } = parseBlockAndTrackers(source);
			expect(trackerSections.length).toBe(2);
		});

		it('should handle --- with trailing space', () => {
			const source = `layout: grid

type: counter
keyColumn: A
valueColumn: B
value: x
---   
type: counter
keyColumn: C
valueColumn: D
value: y`;
			const { trackerSections } = parseBlockAndTrackers(source);
			expect(trackerSections.length).toBe(2);
		});
	});
});
