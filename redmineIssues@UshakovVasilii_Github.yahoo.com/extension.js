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
const GObject = imports.gi.GObject;

const session = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(session, new Soup.ProxyResolverDefault());

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Сonstants = Me.imports.constants;
const AddIssueDialog = Me.imports.addIssueDialog;
const ConfirmDialog = Me.imports.confirmDialog;
const IssueStorage = Me.imports.issueStorage;
const Commands = Me.imports.commands;
const IssueItem = Me.imports.issueItem;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

let redmineIssues = null;

const RISource = class extends MessageTray.Source {

    createIcon(size) {
        return new St.Icon({
            gicon: Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg'),
            icon_size: size
        });
    }

};


const RedmineIssues = GObject.registerClass(class RedmineIssues_RedmineIssues extends PanelMenu.Button {

    _init() {
        super._init(St.Align.START);

        this._source = new RISource(_('Redmine Issues'));

        this._settings = ExtensionUtils.getSettings();

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
        this._addSettingChangedSignal('group-by', Lang.bind(this, this._reranderAll));
        this._addSettingChangedSignal('order-by', Lang.bind(this, this._reranderAll));
        this._addSettingChangedSignal('desc-order', Lang.bind(this, this._reranderAll));
        this._addSettingChangedSignal('max-subject-width', Lang.bind(this, this._maxSubjectWidthChanged));
        this._addSettingChangedSignal('min-menu-item-width', Lang.bind(this, this._minMenuItemWidthChanged));
        this._addSettingChangedSignal('auto-refresh', Lang.bind(this, this._autoRefreshChanged));
        this._addSettingChangedSignal('logs', Lang.bind(this, this._logsChanged));
        this._addSettingChangedSignal('redmine-url', Lang.bind(this, this._checkMainPrefs));
        this._addSettingChangedSignal('api-access-key', Lang.bind(this, this._checkMainPrefs));

        this._startTimer();
    }

    _addSettingChangedSignal(key, callback){
        this._settingChangedSignals.push(this._settings.connect('changed::' + key, callback));
    }

    _checkMainPrefs(){
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
    }

    _logsChanged(){
        this._debugEnabled = this._settings.get_boolean('logs');
        this._issuesStorage.debugEnabled = this._debugEnabled;
    }

    _autoRefreshChanged(){
        if(this._timeoutId) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        let timeout = this._settings.get_int('auto-refresh');
        if(timeout > 0){
            this._timeoutId = Mainloop.timeout_add_seconds(timeout * 60, Lang.bind(this, this._startTimer));
        }
    }

    _startTimer(){
        let timeout = this._settings.get_int('auto-refresh');
        if(timeout > 0) {
            if(!(this._refreshing || !this._isMainPrefsValid)){
               this._refresh();
            }
            this._timeoutId = Mainloop.timeout_add_seconds(timeout * 60, Lang.bind(this, this._startTimer));
        }
    }

    _maxSubjectWidthChanged(){
        let width = this._settings.get_int('max-subject-width');
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                item.setMaxWidth(width);
            }
        }
    }

    _minMenuItemWidthChanged(){
        this.commands.setMinWidth(this._settings.get_int('min-menu-item-width'));
    }

    _addIssueMenuItems(){
        this._issueGroupItems = {};
        this._issueItems = {};

        for(let issueId in this._issuesStorage.issues){
            this._addIssueMenuItem(this._issuesStorage.issues[issueId]);
        }
    }

    _reranderAll(){
        for(let groupId in this._issueGroupItems){
            this._issueGroupItems[groupId].destroy();
        }

        this._addIssueMenuItems();
    }

    _addCommandMenuItem(){
        this.commands = new Commands.Commands();
        this.commands.setMinWidth(this._settings.get_int('min-menu-item-width'));

        this.commands.addIssueButton.connect('clicked', Lang.bind(this, this._addIssueClicked));
        this.commands.preferencesButton.connect('clicked', Lang.bind(this, this._openAppPreferences));
        this.commands.refreshButton.connect('clicked', Lang.bind(this, this._refreshButtonClicked));
        this.commands.removeAllButton.connect('clicked', Lang.bind(this, this._removeAllClicked));
        this.commands.markAllReadButton.connect('clicked', Lang.bind(this, this._markAllReadClicked));
        this.commands.cleanIgnoreListButton.connect('clicked', Lang.bind(this, this._cleanIgnoreListClicked));

        this.menu.addMenuItem(this.commands.commandMenuItem);
    }

    _refreshButtonClicked(){
        if(this._refreshing || !this._isMainPrefsValid){
            return;
        }
        this._refresh();
    }

    _cleanIgnoreListClicked(){
        let confirmDialog = new ConfirmDialog.ConfirmDialog(
            _('Clean ignore list'),
            _('Are you sure you want to remove all issues from ignore list?'),
            Lang.bind(this, function() {
                this._issuesStorage.cleanIgnoreList();
            })
        );
        this.menu.close();
        confirmDialog.open();
    }

    _removeAllIssues(){
        for(let issueId in this._issuesStorage.issues){
            this._removeIssueMenuItem(this._issuesStorage.issues[issueId]);
        }
        this._issuesStorage.removeAll();
    }

    _removeAllClicked(){
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
    }

    _markAllReadClicked(){
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                this._issuesStorage.updateIssueToRead(item.issueId);
                this._makeMenuItemRead(item);
            }
        }
        this._issuesStorage.save();
    }

    _onDestroy(){
        this._debug('Destroy');
        this._source.destroy();
        let settings = this._settings;
        this._settingChangedSignals.forEach(function(signal){
            settings.disconnect(signal);
        });
        Mainloop.source_remove(this._timeoutId);
    }

    _reloadStatusLabels(){
        for(let groupKey in this._issueItems){
            for(let itemKey in this._issueItems[groupKey]){
                let item = this._issueItems[groupKey][itemKey];
                let issue = this._issuesStorage.issues[item.issueId];
                item.reloadStatusLabels(issue);
            }
        }
    }

    _refresh() {
        this._refreshing = true;
        this._hasRefreshError = false;

        this._bookmarkIssuesForCheck = [];
        this._unbookmarkIssuesForCheck = [];

        for(let i in this._issuesStorage.issues){
            if(this._issuesStorage.issues[i].ri_bookmark){
                this._bookmarkIssuesForCheck.push(parseInt(i, 10));
            } else {
                this._unbookmarkIssuesForCheck.push(parseInt(i, 10));
            }
        }

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
            if(this._bookmarkIssuesForCheck.length==0) {
                this._finishRefresh();
            } else {
                for(let i in this._bookmarkIssuesForCheck){
                    this._loadIssue(this._bookmarkIssuesForCheck[i], Lang.bind(this, this._addOrRefreshIssue));
                }
            }
        }
    }

    _addOrRefreshIssue(issue){
        if(this._issuesStorage.addIssue(issue)) {
            this._addIssueMenuItem(issue);
        } else {
            this._refreshIssueMenuItem(issue);
        }
    }

    _loadIssues(filter, callback){
        this._debug('Load filter "' + filter + '"...');
        let url = this._buildRedmineUrl() + 'issues.json?' + filter;
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

                        let issueIndex = this._unbookmarkIssuesForCheck.indexOf(issueId);
                        if (issueIndex > -1) {
                            this._unbookmarkIssuesForCheck.splice(issueIndex, 1);
                        }
                        issueIndex = this._bookmarkIssuesForCheck.indexOf(issueId);
                        if (issueIndex > -1) {
                            this._bookmarkIssuesForCheck.splice(issueIndex, 1);
                        }

                        callback(this._convertIssueFromResponse(issue));
                    }
                } else {
                    this._debug('issues is empty');
                }
            } else if(response.status_code && response.status_code >= 100) {
                this._notify(_('Warning'), _('Cannot load filter "%s", error status_code=%s').format(filter, response.status_code));
            } else {
                this._hasRefreshError = true;
            }

            this._continueOrFinishIssuesLoading(filter);
        }));
    }

    _continueOrFinishIssuesLoading(filter){
        let filterIndex = this._filtersForCheck.indexOf(filter);
        if (filterIndex > -1) {
            this._filtersForCheck.splice(filterIndex, 1);
        }

        if(this._bookmarkIssuesForCheck.length == 0 && this._filtersForCheck.length == 0){
            this._finishRefresh();
        } else if(this._filtersForCheck.length == 0){
            for(let i in this._bookmarkIssuesForCheck){
               this._loadIssue(this._bookmarkIssuesForCheck[i], Lang.bind(this, this._addOrRefreshIssue));
           }
        }
    }

    _loadIssue(id, callback){
        this._debug('Load issue #' + id + '...');
        id = parseInt(id, 10);
        let url = this._buildRedmineUrl() + 'issues/' + id + '.json';
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
            } else {
                this._hasRefreshError = true;
            }
            this._continueOrFinishIssueLoading(id);
        }));
    }

    _notify(message, details){
        if(!Main.messageTray.contains(this._source))
            Main.messageTray.add(this._source);
        this._source.notify(new MessageTray.Notification(this._source, message, details));
    }

    _continueOrFinishIssueLoading(id){
        if(this._bookmarkIssuesForCheck){
            let index = this._bookmarkIssuesForCheck.indexOf(id);
            if (index > -1) {
                this._bookmarkIssuesForCheck.splice(index, 1);
                if(this._refreshing && this._bookmarkIssuesForCheck.length == 0){
                    this._finishRefresh();
                }
            }
        }
    }

    _finishRefresh(){
        this._refreshing = false;

        if(this._hasRefreshError){
            this._debug('Issues will not clean, refresh has some error');
        } else {
            this._unbookmarkIssuesForCheck.forEach(Lang.bind(this, function(issueId){
                this._debug('Delete unbookmark issue #' + issueId + '...');
                let issue = this._issuesStorage.issues[issueId];
                this._issuesStorage.removeIssue(issue.id);
                this._removeIssueMenuItem(issue);
                this._issuesStorage.save();

                let url = this._buildRedmineUrl() + 'issues/' + issueId;
                this._notify(_('#%s was removed').format(issueId), _('%s - %s do not match with any filters and not bookmark, so removed').format(issue.subject, url));
            }));
        }

        this._issuesStorage.save();
        if(this.commands.refreshButton.child) // for disabled state
            this.commands.refreshButton.child.icon_name ='view-refresh-symbolic';
    }

    _buildRedmineUrl(){
        let redmineUrl = this._settings.get_string('redmine-url');
        if(redmineUrl && redmineUrl.slice(-1) != '/')
            redmineUrl += '/';
        return redmineUrl;
    }

    _toSortKey(issue, k){
        if(k == 'id' || k == 'done_ratio')
            return issue[k] || -1;
        if(k == 'priority')
           return issue[k] ? (issue[k].id || -1) : -1;
        if(k == 'updated_on' || k ==  'subject')
            return issue[k] || '';
        return issue[k] ? (issue[k].name || '') : '';
    }

    _refreshIssueMenuItem(newIssue) {
        let oldIssue = this._issuesStorage.issues[newIssue.id];
        if(!oldIssue) // for ignored issue
            return;
        if(!this._issuesStorage.updateIssueUnreadFields(newIssue))
            return;

        let groupBy = this._settings.get_string('group-by');
        let orderBy = this._settings.get_string('order-by');

        let oldGroupKey = oldIssue[groupBy] ? oldIssue[groupBy].id : -1;
        let newGroupKey = newIssue[groupBy] ? newIssue[groupBy].id : -1;

        let oldSortKey = this._toSortKey(oldIssue, orderBy);
        let newSortKey = this._toSortKey(newIssue, orderBy);

        if(newGroupKey != oldGroupKey || oldSortKey != newSortKey){
            this._removeIssueMenuItem(oldIssue);
            this._addIssueMenuItem(newIssue);
        } else {
            let item = this._issueItems[oldGroupKey][newIssue.id];
            item.makeUnread(newIssue);
            this._refreshGroupStyleClass(oldGroupKey);
        }
    }

    _addIssueClicked() {
        let addIssueDialog = new AddIssueDialog.AddIssueDialog(Lang.bind(this, function(issueId){
            if(!issueId)
                return;
            this._loadIssue(issueId, Lang.bind(this, function(issue) {
                issue.ri_bookmark=true;
                if(this._issuesStorage.addIssue(issue, true)) {
                    this._addIssueMenuItem(issue);
                    this._issuesStorage.save();
                }
            }));
        }));
        this.menu.close();
        addIssueDialog.open();
    }

    _removeIssueClicked(issue){
        let message = issue.ri_bookmark ?
            _('Are you sure you want to delete "%s"?').format(issue.subject) :
            _('Are you sure you want to delete "%s"?\nIssue will be added to ignore list').format(issue.subject)
        let confirmDialog = new ConfirmDialog.ConfirmDialog(
            _('Delete #%s').format(issue.id),
            message,
            Lang.bind(this, function() {
                this._issuesStorage.removeIssue(issue.id, !issue.ri_bookmark);
                this._removeIssueMenuItem(issue);
                this._issuesStorage.save();
            })
        );
        this.menu.close();
        confirmDialog.open();
    }

    _removeIssueMenuItem(issue){
        let groupBy = this._settings.get_string('group-by');

        let groupId = issue[groupBy] ? issue[groupBy].id : -1;
        this._issueItems[groupId][issue.id].menuItem.destroy();
        delete this._issueItems[groupId][issue.id];
        if(Object.keys(this._issueItems[groupId]).length==0){
            delete this._issueItems[groupId];
            this._issueGroupItems[groupId].destroy();
            delete this._issueGroupItems[groupId];
            this._refreshIcon();
        } else {
            this._refreshGroupStyleClass(groupId);
        }
    }

    _addIssueMenuItem(issue){
        this._debug('Add issue menu item... #' + issue.id);
        let sortBy = this._settings.get_string('order-by');
        let item = new IssueItem.IssueItem(issue, this._toSortKey(issue, sortBy));
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
        item.bookmarkButton.connect('clicked', Lang.bind(this, function(){
            let i = this._issuesStorage.issues[item.issueId];
            i.ri_bookmark = !i.ri_bookmark;
            this._issuesStorage.updateIssue(i);
            this._issuesStorage.save();
            item.refreshBookmarkButton(i.ri_bookmark);
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

        let items = [];
        for(let i in this._issueItems[groupId]) {
            items.push(this._issueItems[groupId][i]);
        }

        let deskOrder = this._settings.get_boolean('desc-order');
        items.sort(function(a, b){
            let k = a.sortKey < b.sortKey ? -1 : (a.sortKey > b.sortKey ? 1 : 0);
            if(k == 0)
                k = a.issueId < b.issueId ? -1 : (a.issueId > b.issueId ? 1 : 0);
            return deskOrder ? -k : k;
        });

        let issueIds = [];
        for(let i in items){
            issueIds.push(items[i].issueId);
        }

        issueItem.menu.addMenuItem(item.menuItem, issueIds.indexOf(item.issueId));
        this._refreshGroupStyleClass(groupId);
        this._debug('Finish add issue menu item #' + issue.id);
    }

    _refreshGroupStyleClass(groupId){
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
            this._refreshIcon();
        }
    }

    _refreshIcon(){
        let unread = false;
        for(let issueId in this._issuesStorage.issues){
            if(this._issuesStorage.issues[issueId].unread_fields.length > 0){
                unread = true;
                break;
            }
        }
        this._extensionIcon.gicon = unread ? this._gicon_unread : this._gicon_read;
    }

    _makeMenuItemRead(item){
        item.makeRead();
        let issue = this._issuesStorage.issues[item.issueId];
        let groupByKey = this._settings.get_string('group-by');
        let groupId = issue[groupByKey] ? issue[groupByKey].id : -1;
        this._refreshGroupStyleClass(groupId);
    }

    _issueItemAtivated(item) {
        let url = this._buildRedmineUrl() + 'issues/' + item.issueId;
        Util.spawn(['xdg-open', url]);
        this._issuesStorage.updateIssueToRead(item.issueId);
        this._makeMenuItemRead(item);
        this._issuesStorage.save();
    }

    _convertIssueFromResponse(srcIssue){
        let issue = {id:srcIssue.id, subject : srcIssue.subject, updated_on : srcIssue.updated_on};
        Сonstants.LABEL_KEYS.forEach(function(key){
            let value = srcIssue[key];
            if(value || value==0)
                issue[key]=value;
        });
        return issue;
    }

    _openAppPreferences(){
        Util.spawn(["gnome-shell-extension-prefs", "redmineIssues@UshakovVasilii_Github.yahoo.com"]);
        this.menu.close();
    }

    _debug(message){
        if(this._debugEnabled)
            global.log('[redmine-issues] ' + message);
    }

});

function init() {
    ExtensionUtils.initTranslations();
};

function enable() {
    redmineIssues = new RedmineIssues();
    Main.panel.addToStatusArea('redmineIssues', redmineIssues);
};

function disable() {
    redmineIssues.destroy();
    redmineIssues=null;
};
