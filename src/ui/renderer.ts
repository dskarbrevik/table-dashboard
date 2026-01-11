import { TrackerData, TrackerType } from '../types';

/**
 * Renders tracker visualizations as DOM elements
 */
export class TrackerRenderer {
	/**
	 * Render a tracker based on its type
	 */
	render(container: HTMLElement, type: TrackerType, data: TrackerData, label?: string, source?: string): void {
		container.empty();
		container.addClass('habit-tracker-container');

		// Add label if provided
		if (label) {
			const labelEl = container.createDiv({ cls: 'habit-tracker-label' });
			labelEl.textContent = label;
		}

		// Render based on type
		switch (type) {
			case 'progress_bar':
				this.renderProgressBar(container, data);
				break;
			case 'counter':
				this.renderCounter(container, data);
				break;
			case 'percentage':
				this.renderPercentage(container, data);
				break;
			case 'streak':
				this.renderStreak(container, data);
				break;
			case 'line_plot':
				this.renderLinePlot(container, data);
				break;
		}

		// Add footer with stats
		this.renderFooter(container, data, source);
	}

	/**
	 * Render a progress bar
	 */
	private renderProgressBar(container: HTMLElement, data: TrackerData): void {
		const progressContainer = container.createDiv({ cls: 'habit-progress-bar-container' });
		
		const percentage = data.goal ? Math.min((data.count / data.goal) * 100, 100) : 100;
		const isCompleted = percentage >= 100;
		
		// Progress bar background
		const barBg = progressContainer.createDiv({ cls: 'habit-progress-bar-bg' });
		
		// Progress bar fill
		const barFill = barBg.createDiv({ cls: 'habit-progress-bar-fill' });
		barFill.style.width = `${percentage}%`;
		if (isCompleted) {
			barFill.addClass('completed');
		}
		
		// Text overlay
		const textOverlay = progressContainer.createDiv({ cls: 'habit-progress-text' });
		if (data.goal) {
			textOverlay.textContent = `${data.count} / ${data.goal}`;
		} else {
			textOverlay.textContent = `${data.count}`;
		}
	}

	/**
	 * Render a simple counter
	 */
	private renderCounter(container: HTMLElement, data: TrackerData): void {
		const counterContainer = container.createDiv({ cls: 'habit-counter-container' });
		
		const countEl = counterContainer.createDiv({ cls: 'habit-counter-value' });
		countEl.textContent = data.count.toString();
		
		if (data.goal) {
			const goalEl = counterContainer.createDiv({ cls: 'habit-counter-goal' });
			goalEl.textContent = `Goal: ${data.goal}`;
		}
	}

	/**
	 * Render percentage
	 */
	private renderPercentage(container: HTMLElement, data: TrackerData): void {
		const percentageContainer = container.createDiv({ cls: 'habit-percentage-container' });
		
		const percentage = data.goal ? Math.round((data.count / data.goal) * 100) : 0;
		
		const percentEl = percentageContainer.createDiv({ cls: 'habit-percentage-value' });
		percentEl.textContent = `${percentage}%`;
		
		if (data.goal) {
			const detailEl = percentageContainer.createDiv({ cls: 'habit-percentage-detail' });
			detailEl.textContent = `${data.count} / ${data.goal}`;
		}
	}

	/**
	 * Render streak counter
	 */
	private renderStreak(container: HTMLElement, data: TrackerData): void {
		const streakContainer = container.createDiv({ cls: 'habit-streak-container' });
		
		// Streak only meaningful when we have date-based data (folder scanning)
		const hasStreak = data.streak !== undefined && data.filesScanned > 1;
		
		const streakEl = streakContainer.createDiv({ cls: 'habit-streak-value' });
		if (hasStreak) {
			streakEl.textContent = `🔥 ${data.streak}`;
		} else {
			streakEl.textContent = `✓ ${data.count}`;
		}
		
		const labelEl = streakContainer.createDiv({ cls: 'habit-streak-label' });
		if (hasStreak) {
			labelEl.textContent = 'day streak';
		} else {
			labelEl.textContent = data.count === 1 ? 'completed' : 'completed';
		}
	}

	/**
	 * Render line plot showing trend over time
	 */
	private renderLinePlot(container: HTMLElement, data: TrackerData): void {
		if (!data.timeSeries || data.timeSeries.length === 0) {
			const emptyEl = container.createDiv({ cls: 'habit-line-plot-empty' });
			emptyEl.textContent = 'No data to plot';
			return;
		}

		const plotContainer = container.createDiv({ cls: 'habit-line-plot-container' });
		
		// SVG dimensions
		const width = 400;
		const height = 200;
		const margin = { top: 20, right: 20, bottom: 40, left: 50 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		
		// Create SVG using DOM
		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNS, 'svg');
		svg.setAttribute('class', 'habit-line-plot-svg');
		svg.setAttribute('width', width.toString());
		svg.setAttribute('height', height.toString());
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		
		// Find min/max values
		const values = data.timeSeries.map(d => d.value);
		const maxValue = Math.max(...values, data.goal || 0);
		const minValue = 0;
		
		// Scale functions
		const scaleX = (index: number) => margin.left + (index / (data.timeSeries!.length - 1)) * plotWidth;
		const scaleY = (value: number) => margin.top + plotHeight - ((value - minValue) / (maxValue - minValue || 1)) * plotHeight;
		
		// Create group for plot area
		const g = document.createElementNS(svgNS, 'g');
		
		// Draw grid lines
		for (let i = 0; i <= 5; i++) {
			const y = margin.top + (i / 5) * plotHeight;
			const gridLine = document.createElementNS(svgNS, 'line');
			gridLine.setAttribute('x1', margin.left.toString());
			gridLine.setAttribute('y1', y.toString());
			gridLine.setAttribute('x2', (width - margin.right).toString());
			gridLine.setAttribute('y2', y.toString());
			gridLine.setAttribute('class', 'habit-line-plot-grid');
			g.appendChild(gridLine);
			
			// Y-axis labels
			const value = maxValue - (i / 5) * maxValue;
			const label = document.createElementNS(svgNS, 'text');
			label.setAttribute('x', (margin.left - 10).toString());
			label.setAttribute('y', (y + 4).toString());
			label.setAttribute('class', 'habit-line-plot-label');
			label.setAttribute('text-anchor', 'end');
			label.textContent = Math.round(value).toString();
			g.appendChild(label);
		}
		
		// Draw goal line if exists
		if (data.goal) {
			const goalY = scaleY(data.goal);
			const goalLine = document.createElementNS(svgNS, 'line');
			goalLine.setAttribute('x1', margin.left.toString());
			goalLine.setAttribute('y1', goalY.toString());
			goalLine.setAttribute('x2', (width - margin.right).toString());
			goalLine.setAttribute('y2', goalY.toString());
			goalLine.setAttribute('class', 'habit-line-plot-goal');
			g.appendChild(goalLine);
		}
		
		// Draw line path
		let pathData = '';
		data.timeSeries.forEach((point, index) => {
			const x = scaleX(index);
			const y = scaleY(point.value);
			if (index === 0) {
				pathData += `M ${x} ${y}`;
			} else {
				pathData += ` L ${x} ${y}`;
			}
		});
		
		const path = document.createElementNS(svgNS, 'path');
		path.setAttribute('d', pathData);
		path.setAttribute('class', 'habit-line-plot-path');
		g.appendChild(path);
		
		// Draw data points
		data.timeSeries.forEach((point, index) => {
			const x = scaleX(index);
			const y = scaleY(point.value);
			const circle = document.createElementNS(svgNS, 'circle');
			circle.setAttribute('cx', x.toString());
			circle.setAttribute('cy', y.toString());
			circle.setAttribute('r', '4');
			circle.setAttribute('class', 'habit-line-plot-point');
			
			// Add tooltip
			const title = document.createElementNS(svgNS, 'title');
			title.textContent = `${point.date.toLocaleDateString()}: ${point.value}`;
			circle.appendChild(title);
			
			g.appendChild(circle);
		});
		
		svg.appendChild(g);
		plotContainer.appendChild(svg);
	}

	/**
	 * Render footer with metadata
	 */
	private renderFooter(container: HTMLElement, data: TrackerData, source?: string): void {
		const footer = container.createDiv({ cls: 'habit-tracker-footer' });
		
		const statsItems: string[] = [];
		
		// Only show files scanned for folder mode (not current-file or single file)
		const isFolderMode = source?.startsWith('folder:');
		if (isFolderMode && data.filesScanned > 0) {
			statsItems.push(`${data.filesScanned} files scanned`);
		}
		
		if (data.dateRange.start && data.dateRange.end) {
			const startStr = data.dateRange.start.toLocaleDateString();
			const endStr = data.dateRange.end.toLocaleDateString();
			statsItems.push(`${startStr} - ${endStr}`);
		}
		
		footer.textContent = statsItems.join(' • ');
	}
}
