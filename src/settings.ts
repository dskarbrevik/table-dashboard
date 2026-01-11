import {App, PluginSettingTab, Setting} from "obsidian";
import HabitTrackerPlugin from "./main";
import { HabitTrackerSettings } from "./types";

export const DEFAULT_SETTINGS: HabitTrackerSettings = {
	defaultPeriod: 'monthly',
	dateFormat: 'YYYY-MM-DD'
}

export class HabitTrackerSettingTab extends PluginSettingTab {
	plugin: HabitTrackerPlugin;

	constructor(app: App, plugin: HabitTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Default time period')
			.setDesc('Default period for trackers when not specified')
			.addDropdown(dropdown => dropdown
				.addOption('daily', 'Daily')
				.addOption('weekly', 'Weekly')
				.addOption('monthly', 'Monthly')
				.addOption('yearly', 'Yearly')
				.addOption('all-time', 'All-time')
				.setValue(this.plugin.settings.defaultPeriod)
				.onChange(async (value) => {
					this.plugin.settings.defaultPeriod = value as HabitTrackerSettings['defaultPeriod'];
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Date format used in your daily note filenames (e.g., YYYY-MM-DD)')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));
	}
}
