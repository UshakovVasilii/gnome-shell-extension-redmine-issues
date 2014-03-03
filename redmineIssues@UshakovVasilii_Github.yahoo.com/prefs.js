const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

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

        // General tab
        let generalTab = new Gtk.Grid({row_spacing:10,column_spacing:10, margin:10});
        this.append_page(generalTab,  new Gtk.Label({label: _('General')}));
        
        generalTab.attach(new Gtk.Label({ label: _('Redmine URL'), halign : Gtk.Align.END}), 0, 0, 1, 1);
        let redmineURL = new Gtk.Entry({ hexpand: true });
        generalTab.attach(redmineURL, 1, 0, 1, 1);
        this._settings.bind('redmine-url', redmineURL, 'text', Gio.SettingsBindFlags.DEFAULT);

        generalTab.attach(new Gtk.Label({ label: _('API access key'), halign : Gtk.Align.END}), 0, 1, 1, 1);
        let apiAccessKey = new Gtk.Entry({ hexpand: true });
        generalTab.attach(apiAccessKey, 1, 1, 1, 1);
        this._settings.bind('api-access-key', apiAccessKey, 'text', Gio.SettingsBindFlags.DEFAULT);

        generalTab.attach(new Gtk.Label({ label: _('Auto refresh (min)'), halign : Gtk.Align.END}), 0, 2, 1, 1);
        let autoRefresh = Gtk.SpinButton.new_with_range (0, 60, 1);
        generalTab.attach(autoRefresh, 1, 2, 1, 1);
        this._settings.bind('auto-refresh', autoRefresh, 'value', Gio.SettingsBindFlags.DEFAULT);
        
        // Display tab
        let displayTab = new Gtk.Grid({row_spacing:10,column_spacing:10, margin:10});
        this.append_page(displayTab,  new Gtk.Label({label: _('Display')}));
        let i = 0;

        // Group By ComboBox
        let groupModel = new Gtk.ListStore();
        groupModel.set_column_types([GObject.TYPE_STRING, GObject.TYPE_STRING]);

        let group = new Gtk.ComboBox({model: groupModel});
        let groupRenderer = new Gtk.CellRendererText();
        group.pack_start(groupRenderer, true);
        group.add_attribute(groupRenderer, 'text', 1);

        let groupItems = [
            'project',
            'category',
            'fixed_version',
            'tracker',
            'priority',
            'status',
            'assigned_to',
            'author'
        ];

        groupModel.set(groupModel.append(), [0, 1], [groupItems[0], _('Project')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[1], _('Category')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[2], _('Target version')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[3], _('Tracker')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[4], _('Priority')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[5], _('Status')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[6], _('Assigned To')]);
        groupModel.set(groupModel.append(), [0, 1], [groupItems[7], _('Author')]);

        group.set_active(groupItems.indexOf(this._settings.get_string('group-by')));
        
        group.connect('changed', Lang.bind(this, function(entry) {
            let [success, iter] = group.get_active_iter();
            if (!success)
                return;
            this._settings.set_string('group-by', groupModel.get_value(iter, 0))
        }));

        displayTab.attach(new Gtk.Label({ label: _('Group By'), halign : Gtk.Align.END}), 0, i, 1, 1);
        displayTab.attach(group, 1, i++, 1, 1);

        // Switches
        this._addSwitch({tab : displayTab, key : 'show-status-item-status', label : _('Show Status'), y : i++, x : 0});
        this._addSwitch({tab : displayTab, key : 'show-status-item-assigned-to', label : _('Show Assigned To'), y : i++, x : 0});
        this._addSwitch({tab : displayTab, key : 'show-status-item-tracker', label : _('Show Tracker'), y : i++, x : 0});
        this._addSwitch({tab : displayTab, key : 'show-status-item-priority', label : _('Show Priority'), y : i++, x : 0});
        i=0;
        this._addSwitch({tab : displayTab, key : 'show-status-item-done-ratio', label : _('Show Done Ratio'), y : i++, x : 2});
        this._addSwitch({tab : displayTab, key : 'show-status-item-author', label : _('Show Author'), y : i++, x : 2});
        this._addSwitch({tab : displayTab, key : 'show-status-item-project', label : _('Show Project'), y : i++, x : 2});
        this._addSwitch({tab : displayTab, key : 'show-status-item-fixed-version', label : _('Show Target Version'), y : i++, x : 2});
        this._addSwitch({tab : displayTab, key : 'show-status-item-category', label : _('Show Category'), y : i++, x : 2});

        displayTab.attach(new Gtk.Label({ label: _('Maximum width of Subject (px)'), halign : Gtk.Align.END}), 0, i, 3, 1);
        let maxSubjectWidth = Gtk.SpinButton.new_with_range (300, 1000, 10);
        displayTab.attach(maxSubjectWidth, 3, i++, 1, 1);
        this._settings.bind('max-subject-width', maxSubjectWidth, 'value', Gio.SettingsBindFlags.DEFAULT);

        displayTab.attach(new Gtk.Label({ label: _('Minimum width of Menu Item (px)'), halign : Gtk.Align.END}), 0, i, 3, 1);
        let minMenuItemWidth = Gtk.SpinButton.new_with_range (400, 1100, 10);
        displayTab.attach(minMenuItemWidth, 3, i++, 1, 1);
        this._settings.bind('min-menu-item-width', minMenuItemWidth, 'value', Gio.SettingsBindFlags.DEFAULT);

        // Filters tab
        let filtersTab = new Gtk.Grid({row_spacing:10,column_spacing:10, margin:10});
        this.append_page(filtersTab,  new Gtk.Label({label: _('Filters')}));
        
        let filterHelp = _('Examples:') + '\n<i>status_id=1&amp;project_id=my-project</i>\n' +
            '<i>assigned_to_id=me&amp;status_id=open</i>\n' +
            _('More information:') + ' <a href="http://www.redmine.org/projects/redmine/wiki/Rest_Issues">Rest Issue</a>'
        filtersTab.attach(new Gtk.Label({label : filterHelp, use_markup : true, halign : Gtk.Align.START}), 0, 0, 1, 1);
        let filters = new Gtk.TextView();
        let filtersScroll = new Gtk.ScrolledWindow({expand : true, shadow_type: Gtk.ShadowType.ETCHED_IN});
        filtersScroll.add_with_viewport(filters);
        filtersTab.attach(filtersScroll, 0, 1, 1, 1);
    },

    _addSwitch : function(params){
        params.tab.attach(new Gtk.Label({ label: params.label, halign : Gtk.Align.END}), params.x, params.y, 1, 1);
        let sw = new Gtk.Switch({halign : Gtk.Align.END, valign : Gtk.Align.CENTER});
        params.tab.attach(sw, params.x + 1, params.y, 1, 1);
        this._settings.bind(params.key, sw, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
});

function buildPrefsWidget() {
    let w = new RedmineIssuesPrefsWidget();
    w.show_all();
    return w;
}
