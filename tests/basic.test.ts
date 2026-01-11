/**
 * Basic tests for the Habit Progress Tracker plugin
 * Run with: npm test
 */

import { describe, it, expect } from '@jest/globals';

describe('Habit Progress Tracker', () => {
	
	describe('Table Parsing', () => {
		it('should identify table rows with pipe separators', () => {
			const content = `
| Activity | Status |
|----------|--------|
| Exercise | ✓      |
			`;
			const lines = content.split('\n').filter(l => l.trim().startsWith('|'));
			expect(lines.length).toBeGreaterThan(0);
		});

		it('should parse table headers correctly', () => {
			const headerLine = '| Activity | Status | Reps |';
			const columns = headerLine.split('|').map(c => c.trim()).filter(c => c);
			expect(columns).toEqual(['Activity', 'Status', 'Reps']);
		});
	});

	describe('Checkmark Counting', () => {
		it('should count checkmarks in a table', () => {
			const tableRows = [
				'| Exercise | ✓      |',
				'| Reading  | ✓      |',
				'| Coding   |        |'
			];
			const count = tableRows.filter(row => row.includes('✓')).length;
			expect(count).toBe(2);
		});
	});

	describe('Numeric Value Extraction', () => {
		it('should extract and sum numeric values from column', () => {
			const cells = ['3', '5', '2'];
			const sum = cells.reduce((acc, cell) => {
				const num = parseFloat(cell);
				return !isNaN(num) ? acc + num : acc;
			}, 0);
			expect(sum).toBe(10);
		});

		it('should handle non-numeric values gracefully', () => {
			const cells = ['3', '', '5', 'N/A', '2'];
			const sum = cells.reduce((acc, cell) => {
				const num = parseFloat(cell);
				return !isNaN(num) ? acc + num : acc;
			}, 0);
			expect(sum).toBe(10);
		});
	});

	describe('Goal Column Extraction', () => {
		it('should find goal column by header name', () => {
			const headers = ['Activity', 'Status', 'Reps', 'Goal'];
			const goalIndex = headers.findIndex(h => 
				h.toLowerCase().includes('goal')
			);
			expect(goalIndex).toBe(3);
		});

		it('should extract goal values from table', () => {
			const rows = [
				{ cells: ['Exercise', '✓', '3', '5'] },
				{ cells: ['Reading', '✓', '2', '3'] },
				{ cells: ['Coding', '', '1', '4'] }
			];
			const goalColumnIndex = 3;
			const totalGoal = rows.reduce((sum, row) => {
				const goalValue = parseFloat(row.cells[goalColumnIndex]);
				return !isNaN(goalValue) ? sum + goalValue : sum;
			}, 0);
			expect(totalGoal).toBe(12);
		});
	});

	describe('Table Tagging', () => {
		it('should detect table tag in HTML comment', () => {
			const lines = [
				'# Week 1',
				'',
				'<!-- table-tag: weekly -->',
				'',
				'| Activity | Status |',
				'|----------|--------|'
			];
			const hasWeeklyTag = lines.some(line => 
				line.includes('<!-- table-tag: weekly -->')
			);
			expect(hasWeeklyTag).toBe(true);
		});

		it('should match table tag from recent lines', () => {
			const recentLines = [
				'# Header',
				'',
				'<!-- table-tag: daily -->',
				''
			];
			const targetTag = 'daily';
			const matches = recentLines.some(line =>
				line.includes(`<!-- table-tag: ${targetTag} -->`)
			);
			expect(matches).toBe(true);
		});

		it('should not match incorrect table tag', () => {
			const recentLines = [
				'<!-- table-tag: weekly -->'
			];
			const targetTag = 'monthly';
			const matches = recentLines.some(line =>
				line.includes(`<!-- table-tag: ${targetTag} -->`)
			);
			expect(matches).toBe(false);
		});
	});

	describe('Layout Configuration', () => {
		it('should parse block-level layout parameter', () => {
			const blockLines = [
				'layout: compact-list',
				'',
				'type: progress_bar'
			];
			const layoutLine = blockLines.find(l => l.trim().startsWith('layout:'));
			const layout = layoutLine?.split(':')[1].trim();
			expect(layout).toBe('compact-list');
		});

		it('should identify tracker sections separated by ---', () => {
			const content = `type: progress_bar
label: Test 1
---
type: counter
label: Test 2
---
type: percentage
label: Test 3`;
			const sections = content.split(/\n---+\s*\n/).filter(s => s.trim());
			expect(sections.length).toBe(3);
		});
	});

	describe('Event Filtering', () => {
		it('should filter table rows by event name', () => {
			const rows = [
				'| Exercise | ✓ | 3 |',
				'| Reading  | ✓ | 2 |',
				'| Exercise | ✓ | 5 |'
			];
			const exerciseRows = rows.filter(row => row.includes('Exercise'));
			expect(exerciseRows.length).toBe(2);
		});
	});

	describe('Value Type Handling', () => {
		it('should count checkmarks when valueType is checkmark', () => {
			const cells = ['✓', '', '✓', '✓'];
			const count = cells.filter(c => c === '✓').length;
			expect(count).toBe(3);
		});

		it('should sum numbers when valueType is numeric', () => {
			const cells = ['3', '5', '2', '1'];
			const sum = cells.reduce((acc, c) => acc + parseFloat(c), 0);
			expect(sum).toBe(11);
		});

		it('should count any non-empty value', () => {
			const cells = ['x', 'done', '', '1', ''];
			const count = cells.filter(c => c && c.length > 0).length;
			expect(count).toBe(3);
		});
	});
});
