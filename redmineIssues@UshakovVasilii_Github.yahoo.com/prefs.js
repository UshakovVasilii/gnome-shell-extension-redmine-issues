const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

function init() {
	Convenience.initTranslations();
}

const RedmineIssuesPrefsWidget = new GObject.Class({
	Name: 'Redmine.Issues.Prefs.Widget',
	GTypeName: 'RedmineIssuesPrefsWidget',
	Extends: Gtk.Notebook,

	_init: function(params) {
		this.parent(params);

		this._settings = Convenience.getSettings();

		let generalTab = new Gtk.Grid({row_spacing:10,column_spacing:10, margin:10});
		this.append_page(generalTab,  new Gtk.Label({label: _('General')}));
		
		generalTab.attach(new Gtk.Label({ label: _('Redmine URL')}), 0, 0, 1, 1);
		let redmineURL = new Gtk.Entry({ hexpand: true });
		generalTab.attach(redmineURL, 1, 0, 1, 1);
		this._settings.bind('redmine-url', redmineURL, 'text', Gio.SettingsBindFlags.DEFAULT);

		generalTab.attach(new Gtk.Label({ label: _('API access key')}), 0, 1, 1, 1);
		let apiAccessKey = new Gtk.Entry({ hexpand: true });
		generalTab.attach(apiAccessKey, 1, 1, 1, 1);
		this._settings.bind('api-access-key', apiAccessKey, 'text', Gio.SettingsBindFlags.DEFAULT);

		let displayTab = new Gtk.Grid({row_spacing:10,column_spacing:10, margin:10});
		this.append_page(displayTab,  new Gtk.Label({label: _('Display')}));
		let i = 0;

		this._addSwitch({tab : displayTab, key : 'show-status-item-status', label : _('Show Status'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-assigned-to', label : _('Show Assigned To'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-tracker', label : _('Show Tracker'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-priority', label : _('Show Priority'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-done-ratio', label : _('Show Done Ratio'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-author', label : _('Show Author'), y : i++});
		this._addSwitch({tab : displayTab, key : 'show-status-item-project', label : _('Show Project'), y : i++});

	},

	_addSwitch : function(params){
		params.tab.attach(new Gtk.Label({ label: params.label}), 0, params.y, 1, 1);
		let sw = new Gtk.Switch();
		params.tab.attach(sw, 1, params.y, 1, 1);
		this._settings.bind(params.key, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
	}
});

function buildPrefsWidget() {
	let w = new RedmineIssuesPrefsWidget();
	w.show_all();
	return w;
}
