const Mainloop = imports.mainloop;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
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
const Сonstants = Me.imports.constants;
const AddIssueDialog = Me.imports.addIssueDialog;
const ConfirmDialog = Me.imports.confirmDialog;
const IssueStorage = Me.imports.issueStorage;
const Commands = Me.imports.commands;
const IssueItem = Me.imports.issueItem;

let redmineIssues = null;

const RISource = new Lang.Class({
    Name: 'RISource',
    Extends: MessageTray.Source,

    createIcon: function(size) {
        return new St.Icon({
            gicon: Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg'),
            icon_size: size
        });
    },

});

const RedmineIssues = new Lang.Class({
    Name: 'RedmineIssuesMenuItem',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(St.Align.START);

        this._source = new RISource(_('Redmine Issues'));

        this._settings = Convenience.getSettings();

        this._gicon_read = Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg');
        this._gicon_unread = Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-unread-symbolic.svg');
        this._extensionIcon = new St.Icon({
            gicon: this._gicon_read,
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(this._extensionIcon);

        this._debugEnabled = this._settings.get_boolean('logs');
        this._issuesStorage = new IssueStorage.IssueStorage();
        this._issuesStorage.debugEnabled = this._debugEnabled;

        this._addIssueMenuItems();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._checkMainPrefs();

        this.menu.connect('open-state-changed', Lang.bind(this, function(){
            if(this.commands)
                this.commands.sync();
        }));

        this._settingChangedSignals = [];
        this.connect('destroy', Lang.bind(this, this._onDestroy));
        Сonstants.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            this._addSettingChangedSignal('show-status-item-' + key.replace('_','-'), Lang.bind(this, this._reloadStatusLabels));
        }));
        this._addSettingChangedSignal('group-by', Lang.bind(this, this._groupByChanged));
        this._addSettingChangedSignal('max-subject-width', Lang.bind(this, this._maxSubjectWidthChanged));
        this._addSettingChangedSignal('min-menu-item-width', Lang.bind(this, this._minMenuItemWidthChanged));
        this._addSettingChangedSignal('auto-refresh', Lang.bind(this, this._autoRefreshChanged));
        this._addSettingChangedSignal('logs', Lang.bind(this, this._logsChanged));
        this._addSettingChangedSignal('redmine-url', Lang.bind(this, this._checkMainPrefs));
        this._addSettingChangedSignal('api-access-key', Lang.bind(this, this._checkMainPrefs));

        this._startTimer();
    },

    _addSettingChangedSignal : function(key, callback){
        this._settingChangedSignals.push(this._settings.connect('changed::' + key, callback));
    },

    _checkMainPrefs : function(){
        let hasIssues = Object.keys(this._issuesStorage.issues).length!=0;
        let apiAccessKey = this._settings.get_string('api-access-key');
        let redmineUrl = this._settings.get_string('redmine-url');
        this._isMainPrefsValid = !(!apiAccessKey || !redmineUrl || redmineUrl=='http://');
        if(!hasIssues && !this._isMainPrefsValid){
            if(!this.helpMenuItem) {
                if(this.commands){
                    this.commands.destroy();
                    this.commands = null;
                }
            
                this.helpMenuItem = new PopupMenu.PopupMenuItem(_('You should input "Api Access Key" and "Redmine URL"'));
                this.helpMenuItem.connect('activate', this._openAppPreferences);
                this.menu.addMenuItem(this.helpMenuItem);
            }
        } else if(!this.commands) {
            if(this.helpMenuItem) {
                this.helpMenuItem.destroy();
                this.helpMenuItem = null;
            }
            this._addCommandMenuItem();
        }
    },

    _logsChanged : function(){
        this._debugEnabled = this._settings.get_boolean('logs');
        this._issuesStorage.debugEnabled = this._debugEnabled;
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
            if(!(this._refreshing || !this._isMainPrefsValid)){
               this._refresh();
            }
            this._timeoutId = Mainloop.timeout_add_seconds(timeout * 60, Lang.bind(this, this._startTimer));
        }
    },

    _maxSubjectWidthChanged : function(){
        let width = this._settings.get_int('max-subject-width');
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                item.setMaxWidth(width);
            }
        }
    },

    _minMenuItemWidthChanged : function(){
        this.commands.setMinWidth(this._settings.get_int('min-menu-item-width'));
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
        this.commands = new Commands.Commands();
        this.commands.setMinWidth(this._settings.get_int('min-menu-item-width'));

        this.commands.addIssueButton.connect('clicked', Lang.bind(this, this._addIssueClicked));
        this.commands.preferencesButton.connect('clicked', Lang.bind(this, this._openAppPreferences));
        this.commands.refreshButton.connect('clicked', Lang.bind(this, this._refreshButtonClicked));
        this.commands.removeAllButton.connect('clicked', Lang.bind(this, this._removeAllClicked));
        this.commands.markAllReadButton.connect('clicked', Lang.bind(this, this._markAllReadClicked));
        this.commands.reloadButton.connect('clicked', Lang.bind(this, this._reloadIssues));

        this.menu.addMenuItem(this.commands.commandMenuItem);
    },

    _refreshButtonClicked : function(){
        if(this._refreshing || !this._isMainPrefsValid){
            return;
        }
        this._refresh();
    },

    _reloadIssues : function(){
        if(this._refreshing || !this._isMainPrefsValid){
            return;
        }
        this._reloading = true;
        this._refresh();
    },

    _removeAllIssues : function(){
        for(let issueId in this._issuesStorage.issues){
            this._removeIssueMenuItem(this._issuesStorage.issues[issueId]);
        }
        this._issuesStorage.removeAll();
    },

    _removeAllClicked : function(){
        let confirmDialog = new ConfirmDialog.ConfirmDialog(
            _('Delete all issues'),
            _('Are you sure you want to delete all issues?'),
            Lang.bind(this, function() {
                this._removeAllIssues();
                this._issuesStorage.save();
            })
        );
        this.menu.close();
        confirmDialog.open();
    },

    _markAllReadClicked : function(){
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                this._issuesStorage.updateIssueToRead(item.issueId);
                this._makeMenuItemRead(item);
            }
        }
        this._issuesStorage.save();
    },

    _onDestroy : function(){
        this._debug('Destroy');
        this._source.destroy();
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
                let issue = this._issuesStorage.issues[item.issueId];
                item.reloadStatusLabels(issue);
            }
        }
    },

    _refresh : function() {
        this._refreshing = true;

        this._issuesForCheck = [];
        for(let i in this._issuesStorage.issues){
            this._issuesForCheck.push(parseInt(i, 10));
        }

        if(this._reloading) {
            this.commands.reloadButton.child.icon_name='content-loading-symbolic';
            this._removeAllIssues();
        } else
            this.commands.refreshButton.child.icon_name ='content-loading-symbolic';

        let filters = []
        let srcFilters = this._settings.get_strv('filters');
        for(let i in srcFilters){
            let filter = srcFilters[i];
            let index = filter.indexOf('//',10);
            if(index > 0)
                filter = filter.slice(0, index);
            filters.push(filter.trim());
        }
        
        this._filtersForCheck = filters.slice(0);
        if(filters.length > 0){
            filters.forEach(Lang.bind(this, function(filter){
                this._loadIssues(filter, Lang.bind(this, this._addOrRefreshIssue));
            }));
        } else {
            if(this._issuesForCheck.length==0) {
                this._finishRefresh();
            } else {
                for(let i in this._issuesForCheck){
                    this._loadIssue(this._issuesForCheck[i], Lang.bind(this, this._addOrRefreshIssue));
                }
            }
        }
    },

    _addOrRefreshIssue : function(issue){
        if(this._issuesStorage.addIssue(issue)) {
            this._addIssueMenuItem(issue);
        } else {
            this._refreshIssueMenuItem(issue);
        }
    },

    _loadIssues : function(filter, callback){
        this._debug('Load filter "' + filter + '"...');
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        let url = redmineUrl + 'issues.json?' + filter;
        let request = Soup.Message.new('GET', url);
        if(!request){
           this._debug('request is null, "' + url + '" is wrong');
           this._continueOrFinishIssuesLoading(filter);
           return;
        }
        request.request_headers.append('X-Redmine-API-Key', this._settings.get_string('api-access-key'));

        session.queue_message(request, Lang.bind(this, function(session, response) {
            this._debug('Filter "' + filter + '" loaded, status_code=' + response.status_code);
            if(response.status_code == 200){
                let issues=JSON.parse(response.response_body.data).issues;
                if(issues && issues.length > 0){
                    this._debug('issues count=' + issues.length);
                    for(let i in issues){
                        let issue = issues[i];
                        let issueId = parseInt(issue.id, 10);
                        let issueIndex = this._issuesForCheck.indexOf(issueId);
                        if (issueIndex > -1) {
                            this._issuesForCheck.splice(issueIndex, 1);
                        }
                        callback(this._convertIssueFromResponse(issue));
                    }
                } else {
                    this._debug('issues is empty');
                }
            } else if(response.status_code && response.status_code >= 100) {
                this._notify(_('Warning'), _('Cannot load filter "%s", error status_code=%s').format(filter, response.status_code));
            }
  
            this._continueOrFinishIssuesLoading(filter);
        }));
    },

    _continueOrFinishIssuesLoading : function(filter){
        let filterIndex = this._filtersForCheck.indexOf(filter);
        if (filterIndex > -1) {
            this._filtersForCheck.splice(filterIndex, 1);
        }
  
        if(this._issuesForCheck.length == 0){
            this._finishRefresh();
        } else if(this._filtersForCheck.length == 0){
            for(let i in this._issuesForCheck){
               this._loadIssue(this._issuesForCheck[i], Lang.bind(this, this._addOrRefreshIssue));
           }
        }
    },

    _loadIssue : function(id, callback){
        this._debug('Load issue #' + id + '...');
        id = parseInt(id, 10);
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        let url = redmineUrl + 'issues/' + id + '.json';
        let request = Soup.Message.new('GET', url);

        if(!request){
            this._debug('request is null, "' + url + '" is wrong');
            this._continueOrFinishIssueLoading(id);
            return;
        }

        request.request_headers.append('X-Redmine-API-Key', this._settings.get_string('api-access-key'));

        session.queue_message(request, Lang.bind(this, function(session, response) {
            this._debug('Issue "' + id + '" loaded, status_code=' + response.status_code);
            if(response.status_code == 200){
                let issue=JSON.parse(response.response_body.data).issue;
                callback(this._convertIssueFromResponse(issue));
            } else if(response.status_code && response.status_code >= 100) {
                this._notify(_('Warning'), _('Cannot load issue #%s, error status_code=%s').format(id, response.status_code));
            }
            this._continueOrFinishIssueLoading(id);
        }));
    },

    _notify : function(message, details){
        if(!Main.messageTray.contains(this._source))
            Main.messageTray.add(this._source);
        let notification = new MessageTray.Notification(this._source, message, details);
        notification.setTransient(true);
        this._source.notify(notification);
    },

    _continueOrFinishIssueLoading : function(id){
        if(this._issuesForCheck){
            let index = this._issuesForCheck.indexOf(id);
            if (index > -1) {
                this._issuesForCheck.splice(index, 1);
                if(this._refreshing && this._issuesForCheck.length == 0){
                    this._finishRefresh();
                }
            }
        }
    },

    _finishRefresh : function(){
        this._refreshing = false;
        this._issuesStorage.save();
        if(this._reloading){
            this.commands.reloadButton.child.icon_name='emblem-synchronizing-symbolic';
            this._reloading = false;
        } else
            this.commands.refreshButton.child.icon_name ='view-refresh-symbolic';
    },

    _refreshIssueMenuItem : function(newIssue) {
        let oldIssue = this._issuesStorage.issues[newIssue.id];
        if(!this._issuesStorage.updateIssueUnreadFields(newIssue))
            return;
        let groupByKey = this._settings.get_string('group-by');
        let groupId = oldIssue[groupByKey] ? oldIssue[groupByKey].id : -1;

        let groupChanged = false;
        Сonstants.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            if(newIssue.unread_fields.indexOf(key) >= 0){
                if(groupByKey == key && (oldIssue[key] && newIssue[key] && oldIssue[key].id != newIssue[key].id
                        || oldIssue[key] && !newIssue[key] || !oldIssue[key] && newIssue[key])){
                    groupChanged=true;
                }
            }
        }));

        if(groupChanged){
            this._removeIssueMenuItem(oldIssue);
            this._addIssueMenuItem(newIssue);
        } else {
            let item = this._issueItems[groupId][newIssue.id];
            item.makeUnread(newIssue);
            this._refreshGroupStyleClass(groupId);
        }
    },

    _addIssueClicked : function() {
        let addIssueDialog = new AddIssueDialog.AddIssueDialog(Lang.bind(this, function(issueId){
            if(!issueId)
                return;
            this._loadIssue(issueId, Lang.bind(this, function(issue) {
                if(this._issuesStorage.addIssue(issue)) {
                    this._addIssueMenuItem(issue);
                    this._issuesStorage.save();
                }
            }));
        }));
        this.menu.close();
        addIssueDialog.open();
    },

    _removeIssueClicked : function(issue){
        let confirmDialog = new ConfirmDialog.ConfirmDialog(
            _('Delete #%s').format(issue.id),
            _('Are you sure you want to delete "%s"?').format(issue.subject),
            Lang.bind(this, function() {
                this._issuesStorage.removeIssue(issue.id);
                this._removeIssueMenuItem(issue);
                this._issuesStorage.save();
            })
        );
        this.menu.close();
        confirmDialog.open();
    },

    _removeIssueMenuItem : function(issue){
        let groupBy = this._settings.get_string('group-by');

        let groupId = issue[groupBy] ? issue[groupBy].id : -1;
        this._issueItems[groupId][issue.id].menuItem.destroy();
        delete this._issueItems[groupId][issue.id];
        if(Object.keys(this._issueItems[groupId]).length==0){
            delete this._issueItems[groupId];
            this._issueGroupItems[groupId].destroy();
            delete this._issueGroupItems[groupId];
        } else {
            this._refreshGroupStyleClass(groupId);
        }
    },

    _addIssueMenuItem : function(issue){
        this._debug('Add issue menu item... #' + issue.id);
        let item = new IssueItem.IssueItem(issue);
        item.markReadButton.connect('clicked', Lang.bind(this, function(){
            this._issuesStorage.updateIssueToRead(item.issueId);
            this._makeMenuItemRead(item);
            this._issuesStorage.save();
        }));
        item.removeIssueButton.connect('clicked', Lang.bind(this, function(){
            this._removeIssueClicked(issue);
        }));
        item.menuItem.connect('activate', Lang.bind(this, function(){
            this._issueItemAtivated(item);
        }));

        let groupByKey = this._settings.get_string('group-by');

        let groupId = issue[groupByKey] ? issue[groupByKey].id : -1;
        let issueItem = this._issueGroupItems[groupId];
        if(!issueItem){
            issueItem = new PopupMenu.PopupSubMenuMenuItem(groupId == -1 ? _('Ungrouped') : issue[groupByKey].name);
            this._issueGroupItems[groupId] = issueItem;
            this._issueItems[groupId] = {};

            let groupNames = [];
            for(let i in this._issueGroupItems){
                groupNames.push(this._issueGroupItems[i].label.text);
            }
            groupNames.sort();

            this.menu.addMenuItem(issueItem, groupNames.indexOf(issueItem.label.text));
        }
        this._issueItems[groupId][issue.id] = item;

        let issueIds = [];
        for(let i in this._issueItems[groupId]){
            issueIds.push(this._issueItems[groupId][i].issueId);
        }
        issueIds.sort();

        issueItem.menu.addMenuItem(item.menuItem, issueIds.indexOf(item.issueId));
        this._refreshGroupStyleClass(groupId);
        this._debug('Finish add issue menu item #' + issue.id);
    },

    _refreshGroupStyleClass : function(groupId){
        let unread = false;
        for(let issueId in this._issueItems[groupId]){
            if(this._issuesStorage.issues[issueId].unread_fields.length > 0){
                unread=true;
                break;
            }
        }
        if(unread) {
            this._issueGroupItems[groupId].actor.add_style_class_name('ri-group-label-unread');
            this._extensionIcon.gicon = this._gicon_unread;
        } else {
            this._issueGroupItems[groupId].actor.remove_style_class_name('ri-group-label-unread');
            for(let issueId in this._issuesStorage.issues){
                if(this._issuesStorage.issues[issueId].unread_fields.length > 0){
                    unread = true;
                    break;
                }
            }
            this._extensionIcon.gicon = unread ? this._gicon_unread : this._gicon_read;
        }
    },

    _makeMenuItemRead : function(item){
        item.makeRead();
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
        this._issuesStorage.save();
    },

    _convertIssueFromResponse : function(srcIssue){
        let issue = {id:srcIssue.id, subject : srcIssue.subject, updated_on : srcIssue.updated_on};
        Сonstants.LABEL_KEYS.forEach(function(key){
            let value = srcIssue[key];
            if(value || value==0)
                issue[key]=value;
        });
        return issue;
    },

    _openAppPreferences : function(){
        Util.spawn(["gnome-shell-extension-prefs", "redmineIssues@UshakovVasilii_Github.yahoo.com"]);
        this.menu.close();
    },

    _debug : function(message){
        if(this._debugEnabled)
            global.log('[redmine-issues] ' + message);
    },

});

function init() {
    Convenience.initTranslations();
};

function enable() {
    redmineIssues = new RedmineIssues();
    Main.panel.addToStatusArea('redmineIssues', redmineIssues);
};

function disable() {
    redmineIssues.destroy();
    redmineIssues=null;
};

