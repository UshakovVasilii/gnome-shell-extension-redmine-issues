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
	Extends: Gtk.Grid,

	_init: function(params) {
		this.parent(params);
		this.margin = this.row_spacing = this.column_spacing = 10;

		this.attach(new Gtk.Label({ label: _('Redmine URL')}), 0, 0, 1, 1);
		let redmineURL = new Gtk.Entry({ hexpand: true });
		this.attach(redmineURL, 1, 0, 1, 1);

		this.attach(new Gtk.Label({ label: _('API access key')}), 0, 1, 1, 1);
		let apiAccessKey = new Gtk.Entry({ hexpand: true });
		this.attach(apiAccessKey, 1, 1, 1, 1);

		this._settings = Convenience.getSettings();
		this._settings.bind('redmine-url', redmineURL, 'text', Gio.SettingsBindFlags.DEFAULT);
		this._settings.bind('api-access-key', apiAccessKey, 'text', Gio.SettingsBindFlags.DEFAULT);
	}
});

function buildPrefsWidget() {
	let w = new RedmineIssuesPrefsWidget();
	w.show_all();
	return w;
}
