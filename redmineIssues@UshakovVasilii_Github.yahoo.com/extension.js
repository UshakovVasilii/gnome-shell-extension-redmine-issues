const Mainloop = imports.mainloop;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;
const Util = imports.misc.util;
const Lang = imports.lang;
const Gio = imports.gi.Gio;

const session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const AddIssueDialog = Me.imports.addIssueDialog;
const ConfirmDialog = Me.imports.confirmDialog;
const IssueStorage = Me.imports.issueStorage;

let redmineIssues = null;

const RedmineIssues = new Lang.Class({
    Name: 'RedmineIssuesMenuItem',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(St.Align.START);

        this._settings = Convenience.getSettings();
        

        this.actor.add_actor(new St.Icon({
            gicon: Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg'),
            style_class: 'system-status-icon'
        }));

        this._issuesStorage = new IssueStorage.IssueStorage();

        this._addIssueMenuItems();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._addCommandMenuItem();

        this._settingChangedSignals = [];
        IssueStorage.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            this._settingChangedSignals.push(this._settings.connect('changed::show-status-item-' + key, Lang.bind(this, this._reloadStatusLabels)));
        }));
        this._settingChangedSignals.push(this._settings.connect('changed::group-by', Lang.bind(this, this._groupByChanged)));
        this._settingChangedSignals.push(this._settings.connect('changed::max-subject-width', Lang.bind(this, this._maxSubjectWidthChanged)));
        this._settingChangedSignals.push(this._settings.connect('changed::min-menu-item-width', Lang.bind(this, this._minMenuItemWidthChanged)));
        this._settingChangedSignals.push(this._settings.connect('changed::auto-refresh', Lang.bind(this, this._autoRefreshChanged)));

        this._startTimer();
    },

    _autoRefreshChanged : function(){
        if(this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        let timeout = this._settings.get_int('auto-refresh');
        if(timeout > 0){
            this._timeoutId = Mainloop.timeout_add_seconds(timeout * 60, Lang.bind(this, this._startTimer));
        }
    },

    _startTimer : function(){
        let timeout = this._settings.get_int('auto-refresh');
        if(timeout > 0) {
            this._refresh();
            this._timeoutId = Mainloop.timeout_add_seconds(timeout * 60, Lang.bind(this, this._startTimer));
        }
    },

    _maxSubjectWidthChanged : function(){
        let maxSubjectWidth = this._settings.get_int('max-subject-width');
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                item.issueLabel.style = 'max-width:' + maxSubjectWidth + 'px';
            }
        }
    },

    _minMenuItemWidthChanged : function(){
        this.commandMenuItem.actor.style = 'min-width:' + this._settings.get_int('min-menu-item-width') + 'px';
    },

    _addIssueMenuItems : function(){
        this._issueGroupItems = {};
        this._issueItems = {};

        for(let issueId in this._issuesStorage.issues){
            this._addIssueMenuItem(this._issuesStorage.issues[issueId]);
        }
    },

    _groupByChanged : function(){
        for(let groupId in this._issueGroupItems){
            this._issueGroupItems[groupId].destroy();
        }

        this._addIssueMenuItems();
    },

    _addCommandMenuItem : function(){
        this.commandMenuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false});
        this.commandMenuItem.actor.style = 'min-width:' + this._settings.get_int('min-menu-item-width') + 'px';

        let addIssueButton = new St.Button({
            child: new St.Icon({icon_name: 'list-add-symbolic'}),
            style_class: 'system-menu-action'
        });
        addIssueButton.connect('clicked', Lang.bind(this, this._addIssueClicked));
        this.commandMenuItem.actor.add(addIssueButton, { expand: true, x_fill: false });

        this.commandMenuItem.refreshButton = new St.Button({
                    child: new St.Icon({icon_name: 'view-refresh-symbolic'}),
            style_class: 'system-menu-action'
        });
        this.commandMenuItem.refreshButton.connect('clicked', Lang.bind(this, this._refresh));
        this.commandMenuItem.actor.add(this.commandMenuItem.refreshButton, { expand: true, x_fill: false });

        this.menu.addMenuItem(this.commandMenuItem);
    },

    disconnectSignalsAndStopTimer : function(){
        let settings = this._settings;
        this._settingChangedSignals.forEach(function(signal){
            settings.disconnect(signal);
        });
        Mainloop.source_remove(this._timeoutId);
    },

    _reloadStatusLabels : function(){
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];

                for(let labelKey in item.statusLabels){
                    item.statusLabels[labelKey].destroy();
                }
                item.statusLabels = {};
                this._addStatusLabels(item);
            }
        }
    },

    _refresh : function() {
        if(this._refreshing){
            return;
        }
        this._refreshing = true;
        this.commandMenuItem.refreshButton.child.icon_name ='content-loading-symbolic';
        this._issuesForCheck = [];
        for(let i in this._issuesStorage.issues){
            this._issuesForCheck.push(parseInt(i, 10));
        }

        let filters = this._settings.get_strv('filters');
        this._filtersForCheck = filters.slice(0);
        if(filters && filters.length > 0){
            filters.forEach(Lang.bind(this, function(filter){
                this._loadIssues(filter, Lang.bind(this, this._refreshIssueMenuItem));
            }));
        } else {
            for(let i in this._issuesStorage.issues){
                this._loadIssue(i, Lang.bind(this, this._refreshIssueMenuItem));
            }
        }
    },

    _loadIssues : function(filter, callback){
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        let request = Soup.Message.new('GET', redmineUrl + 'issues.json?' + filter);
        request.request_headers.append('X-Redmine-API-Key', this._settings.get_string('api-access-key'));

        session.queue_message(request, Lang.bind(this, function(session, response) {
            if(response.status_code == 200){
                let issues=JSON.parse(response.response_body.data).issues;
                if(issues && issues.length > 0){
                    for(let i in issues){
                        let issue = issues[i];
                        let issueId = parseInt(issue.id, 10);
                        let issueIndex = this._issuesForCheck.indexOf(issueId);
                        if (issueIndex > -1) {
                            this._issuesForCheck.splice(issueIndex, 1);
                        }
                        callback(this._convertIssueFromResponse(issue));
                    }
                }
            } else if(response.status_code && response.status_code >= 100) {
                Main.notify(_('Cannot load filter "%s", error status_code=%s').format(filter, response.status_code));
            }
            let filterIndex = this._filtersForCheck.indexOf(filter);
            if (filterIndex > -1) {
                this._filtersForCheck.splice(filterIndex, 1);
            }
  
            if(this._issuesForCheck.length == 0){
                this._finishRefresh();
            } else if(this._filtersForCheck.length == 0){
                for(let i in this._issuesForCheck){
                    this._loadIssue(this._issuesForCheck[i], Lang.bind(this, this._refreshIssueMenuItem));
                }
            }
        }));
    },

    _loadIssue : function(id, callback){
        id = parseInt(id, 10);
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        let request = Soup.Message.new('GET', redmineUrl + 'issues/' + id + '.json');
        request.request_headers.append('X-Redmine-API-Key', this._settings.get_string('api-access-key'));

        session.queue_message(request, Lang.bind(this, function(session, response) {
            if(response.status_code == 200){
                let issue=JSON.parse(response.response_body.data).issue;
                callback(this._convertIssueFromResponse(issue));
            } else if(response.status_code && response.status_code >= 100) {
                Main.notify(_('Cannot load issue #%s, error status_code=%s').format(id, response.status_code));
            }
            if(this._issuesForCheck){
                 var index = this._issuesForCheck.indexOf(id);
                 if (index > -1) {
                     this._issuesForCheck.splice(index, 1);
                     if(this._refreshing && this._issuesForCheck.length == 0){
                         this._finishRefresh();
                     }
                 }
            }
        }));
    },

    _finishRefresh : function(){
        this._refreshing = false;
        this.commandMenuItem.refreshButton.child.icon_name ='view-refresh-symbolic';
    },

    _refreshIssueMenuItem : function(newIssue) {
        let oldIssue = this._issuesStorage.issues[newIssue.id];
        if(!this._issuesStorage.updateIssueUnreadFields(newIssue))
            return;

        let groupByKey = this._settings.get_string('group-by');
        let groupId = oldIssue[groupByKey] ? oldIssue[groupByKey].id : -1;
        let item = this._issueItems[groupId][newIssue.id];
        item.issueLabel.add_style_class_name('ri-issue-label-unread');
        this._addMarkReadButton(item);

        let groupChanged = false;
        IssueStorage.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            let jsonKey = key.replace('-','_');
            if(newIssue.unread_fields.indexOf(jsonKey) >= 0){
                if(this._settings.get_boolean('show-status-item-' + key))
                    this._makeLabelNew(item, key, key == 'done-ratio' ? newIssue.done_ratio + '%' : newIssue[jsonKey].name);
                if(groupByKey == key && (oldIssue[jsonKey] && newIssue[jsonKey] && oldIssue[jsonKey].id != newIssue[jsonKey].id
                        || oldIssue[jsonKey] && !newIssue[jsonKey] || !oldIssue[jsonKey] && newIssue[jsonKey])){
                    groupChanged=true;
                }
            }
        }));

        if(groupChanged){
            this._removeIssueMenuItem(oldIssue);
            this._addIssueMenuItem(newIssue);
        } else {
            this._refreshGroupStyleClass(groupId);
        }
    },

    _makeLabelNew : function(item, key, text){
        let label = item.statusLabels[key];
        if(label) {
            label.style_class = 'ri-popup-status-menu-item-new';
            label.set_text(text);
        } else {
            this._addStatusLabel(item, key, text, 'ri-popup-status-menu-item-new');
        }
    },

    _makeLabelsRead : function(item){
        IssueStorage.LABEL_KEYS.forEach(function(key){
            let label = item.statusLabels[key];
            if(label)
                label.style_class = 'popup-status-menu-item';
        });
    },

    _addIssueClicked : function() {
        let addIssueDialog = new AddIssueDialog.AddIssueDialog(Lang.bind(this, function(issueId){
            this._loadIssue(issueId, Lang.bind(this, function(issue) {
                if(this._issuesStorage.addIssue(issue)) {
                    this._addIssueMenuItem(issue);
                }
            }));
        }));
        this.menu.close();
        addIssueDialog.open();
    },

    _removeIssueClicked : function(issue){
        let confirmDialog = new ConfirmDialog.ConfirmDialog(
            _('Confirm #%s removal').format(issue.id),
            _('Select OK to delete \n"%s"\n or cancel to abort').format(issue.subject),
            Lang.bind(this, function() {
                this._issuesStorage.removeIssue(issue.id);
                this._removeIssueMenuItem(issue);
            })
        );
        this.menu.close();
            confirmDialog.open();
    },

    _removeIssueMenuItem : function(issue){
        let groupBy = this._settings.get_string('group-by');

        let groupId = issue[groupBy] ? issue[groupBy].id : -1;
        this._issueItems[groupId][issue.id].destroy();
        delete this._issueItems[groupId][issue.id];
        if(Object.keys(this._issueItems[groupId]).length==0){
            delete this._issueItems[groupId];
            this._issueGroupItems[groupId].destroy();
            delete this._issueGroupItems[groupId];
        } else {
            this._refreshGroupStyleClass(groupId);
        }
    },

    _addStatusLabel : function(item, key, text, styleClass){
        let label = new St.Label({text: text, style_class: styleClass});
        item.statusLabels[key] = label;
        item.statusLabelsBox.add(label);
    },

    _addStatusLabels : function(item){
        let issue = this._issuesStorage.issues[item.issueId];

        IssueStorage.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            if(!this._settings.get_boolean('show-status-item-' + key))
                return;
            let jsonKey = key.replace('-','_');
            let styleClass = issue.unread_fields.indexOf(jsonKey) >= 0 ? 'ri-popup-status-menu-item-new' : 'popup-status-menu-item';
            if(key == 'done-ratio' && (issue.done_ratio || issue.done_ratio==0)) {
                this._addStatusLabel(item, 'done-ratio', issue.done_ratio + '%', styleClass);
            } else if(issue[jsonKey]) {
                this._addStatusLabel(item, key, issue[jsonKey].name, styleClass);
            }
        }));
    },

    _addIssueMenuItem : function(issue){
        let item = new PopupMenu.PopupBaseMenuItem();
        item.issueId = issue.id;

        item.statusLabels = {};
        item.issueLabel = new St.Label({text: '#' + issue.id + ' - ' + issue.subject, style_class: 'ri-subject-label'});
        item.issueLabel.style = 'max-width:' + this._settings.get_int('max-subject-width') + 'px';
        let unread = issue.unread_fields.length > 0;
        if(unread)
            item.issueLabel.add_style_class_name('ri-issue-label-unread');
        item.actor.add(item.issueLabel,{x_fill: true, expand: true});

        item.statusLabelsBox = new St.BoxLayout({style_class: 'ri-popup-menu-item-status-labels'});
        item.actor.add(item.statusLabelsBox);
        this._addStatusLabels(item);

        item.buttonBox = new St.BoxLayout();
        item.actor.add(item.buttonBox);

        if(unread)
          this._addMarkReadButton(item);

        let removeIssueButton = new St.Button({
            child: new St.Icon({icon_name: 'list-remove-symbolic', style_class: 'system-status-icon'})
        });
        removeIssueButton.connect('clicked', Lang.bind(this, function(){
            this._removeIssueClicked(issue);
        }));
        item.buttonBox.add(removeIssueButton);

        item.connect('activate', Lang.bind(this, this._issueItemAtivated));

        let groupByKey = this._settings.get_string('group-by');
        
        let groupId = issue[groupByKey] ? issue[groupByKey].id : -1;
        let issueItem = this._issueGroupItems[groupId];
        if(!issueItem){
            issueItem = new PopupMenu.PopupSubMenuMenuItem(groupId == -1 ? _('Ungrouped') : issue[groupByKey].name);
            this._issueGroupItems[groupId] = issueItem;
            this._issueItems[groupId] = {};
            this.menu.addMenuItem(issueItem, 0);
        }
        this._issueItems[groupId][issue.id] = item;
        issueItem.menu.addMenuItem(item);
        this._refreshGroupStyleClass(groupId);
    },

    _addMarkReadButton : function(item){
        item.buttonBox.markReadButton = new St.Button({
            child: new St.Icon({icon_name: 'object-select-symbolic', style_class: 'system-status-icon'})
        });
        item.buttonBox.markReadButton.connect('clicked', Lang.bind(this, function(){
            this._issuesStorage.updateIssueToRead(item.issueId);
            this._makeMenuItemRead(item);
        }));
        item.buttonBox.insert_child_at_index(item.buttonBox.markReadButton, 0);
    },

    _refreshGroupStyleClass : function(groupId){
        let unread = false;
        for(let issueId in this._issueItems[groupId]){
            if(this._issuesStorage.issues[issueId].unread_fields.length > 0){
                unread=true;
                break;
            }
        }
        if(unread)
            this._issueGroupItems[groupId].actor.add_style_class_name('ri-group-label-unread');
        else
            this._issueGroupItems[groupId].actor.remove_style_class_name('ri-group-label-unread');
    },

    _makeMenuItemRead : function(item){
        this._makeLabelsRead(item);
        item.issueLabel.remove_style_class_name('ri-issue-label-unread');
        if(item.buttonBox.markReadButton)
            item.buttonBox.markReadButton.destroy();
        let issue = this._issuesStorage.issues[item.issueId];
        let groupByKey = this._settings.get_string('group-by');
        let groupId = issue[groupByKey] ? issue[groupByKey].id : -1;
        this._refreshGroupStyleClass(groupId);
    },

    _issueItemAtivated : function(item) {
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        let url = redmineUrl + 'issues/' + item.issueId;
        Util.spawn(['xdg-open', url]);
        this._issuesStorage.updateIssueToRead(item.issueId);
        this._makeMenuItemRead(item);
    },

    _convertIssueFromResponse : function(srcIssue){
        let issue = {id:srcIssue.id, subject : srcIssue.subject, updated_on : srcIssue.updated_on};
        IssueStorage.LABEL_KEYS.forEach(function(key){
            let jsonKey = key.replace('-','_');
            let value = srcIssue[jsonKey];
            if(value || value==0)
                issue[jsonKey]=value;
        });
        return issue;
    }

});

function init() {
    Convenience.initTranslations();
};

function enable() {
    redmineIssues = new RedmineIssues();
    Main.panel.addToStatusArea('redmineIssues', redmineIssues);
};

function disable() {
    redmineIssues.disconnectSignalsAndStopTimer();
    redmineIssues.destroy();
    redmineIssues=null;
};

