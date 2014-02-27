
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

const Gettext = imports.gettext.domain('redmine-issue-list');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const AddIssueDialog = Me.imports.addIssueDialog;
const ConfirmDialog = Me.imports.confirmDialog;
const IssueStorage = Me.imports.issueStorage;


let redmineIssues = null;

function RedmineIssues() {
	this._init();
}

RedmineIssues.prototype = {
	__proto__: PanelMenu.Button.prototype,

	_init: function() {
		PanelMenu.Button.prototype._init.call(this, St.Align.START);
		let _this=this;
		
		this._LABEL_KEYS = [
			'show-status-item-status',
			'show-status-item-assigned-to',
			'show-status-item-tracker',
			'show-status-item-priority',
			'show-status-item-done-ratio',
			'show-status-item-author',
			'show-status-item-project']

		this._settings = Convenience.getSettings();
		

		this.actor.add_actor(new St.Icon({
			gicon: Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg'),
			style_class: 'system-status-icon'
		}));

		this._issuesStorage = new IssueStorage.IssueStorage();

		this._issueGroupItems = {};
		this._issueItems = {};
		for(let issueId in this._issuesStorage.issues){
			_this._addIssueMenuItem(_this._issuesStorage.issues[issueId]);
		}

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		this.addCommandMenuItem();

		this._settingChangedSignals = [];
		this._LABEL_KEYS.forEach(function(key){
			_this._settingChangedSignals.push(_this._settings.connect('changed::show-status-item-status', Lang.bind(_this, _this._reloadStatusLabels)));
		});
	},

	addCommandMenuItem : function(){
		let commandMenuItem = new PopupMenu.PopupBaseMenuItem({
			reactive: false,
			can_focus: false,
			style_class: 'ri-command-popup'});

		let addIssueButton = new St.Button({
            		child: new St.Icon({icon_name: 'list-add-symbolic'}),
			style_class: 'system-menu-action'
		});
		addIssueButton.connect('clicked', Lang.bind(this, this._addIssueClicked));
		commandMenuItem.actor.add(addIssueButton, { expand: true, x_fill: false });

		let refreshButton = new St.Button({
            		child: new St.Icon({icon_name: 'view-refresh-symbolic'}),
			style_class: 'system-menu-action'
		});
		refreshButton.connect('clicked', Lang.bind(this, this._refreshClicked));
		commandMenuItem.actor.add(refreshButton, { expand: true, x_fill: false });

		this.menu.addMenuItem(commandMenuItem);
	},

	disconnectSettingChangedSignals : function(){
		let settings = this._settings;
		this._settingChangedSignals.forEach(function(signal){
			settings.disconnect(signal);
		});
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

	_refreshClicked : function() {
		let _this = this;
		for(let i in this._issuesStorage.issues){
			let oldIssue = this._issuesStorage.issues[i];
			this._loadIssue(oldIssue.id, function(newIssue) {
				let item = _this._issueItems[oldIssue.project.id][newIssue.id];

				if(oldIssue.status && oldIssue.status.id != newIssue.status.id)
					_this._makeLabelNew({item : item, key : 'show-status-item-status', value : newIssue.status.name});
				if(oldIssue.assigned_to && oldIssue.assigned_to.id != newIssue.assigned_to.id)
					_this._makeLabelNew({item : item, key : 'show-status-item-assigned-to', value : newIssue.assigned_to.name});
				if(oldIssue.tracker && oldIssue.tracker.id != newIssue.tracker.id)
					_this._makeLabelNew({item : item, key : 'show-status-item-tracker', value : newIssue.tracker.name});
				if(oldIssue.priority && oldIssue.priority.id != newIssue.priority.id)
					_this._makeLabelNew({item : item, key : 'show-status-item-priority', value : newIssue.priority.name});
				if((oldIssue.done_ratio || oldIssue.done_ratio==0) && oldIssue.done_ratio != newIssue.done_ratio)
					_this._makeLabelNew({item : item, key : 'show-status-item-done-ratio', value : newIssue.done_ratio + '%'});
				if(oldIssue.project && oldIssue.project.id != newIssue.project.id)
					_this._makeLabelNew({item : item, key : 'show-status-item-project', value : newIssue.project.name});
			});
		}
	},

	_makeLabelNew : function(params){
		let label = params.item.statusLabels[params.key];
		if(label) {
			label.style_class = 'ri-popup-status-menu-item-new';
			label.set_text(params.value);
		}
	},

	_makeLabelsRead : function(item){
		this._LABEL_KEYS.forEach(function(key){
			let label = item.statusLabels[key];
			label.style_class = 'popup-status-menu-item';
		});
	},

	_addIssueClicked : function() {
		let _this = this;
		let addIssueDialog = new AddIssueDialog.AddIssueDialog(function(issueId){
			_this._loadIssue(issueId, function(issue) {
				if(_this._issuesStorage.addIssue(issue)) {
					_this._addIssueMenuItem(issue);
				}
			});
		});
		this.menu.close();
		addIssueDialog.open();
        },

	_removeIssueClicked : function(issue){
		let _this = this;
		let confirmDialog = new ConfirmDialog.ConfirmDialog(
			_('Confirm #%s removal').format(issue.id),
			_('Select OK to delete \n"%s"\n or cancel to abort').format(issue.subject),
			function() {
				_this._removeIssue(issue);
			}
		);
		this.menu.close();
        	confirmDialog.open();
	},

	_removeIssue : function(issue){
		this._issuesStorage.removeIssue(issue.id);

		let projectId = issue.project.id;
		this._issueItems[projectId][issue.id].destroy();
		delete this._issueItems[projectId][issue.id];
		if(Object.keys(this._issueItems[projectId]).length==0){
			delete this._issueItems[projectId];
			this._issueGroupItems[projectId].destroy();
			delete this._issueGroupItems[projectId];
		}
	},

	_addStatusLabel : function(params){
		if(this._settings.get_boolean(params.key)){
			let label = new St.Label({text: params.value, style_class: 'popup-status-menu-item'});
			params.item.statusLabels[params.key] = label;
			params.item.statusLabelsBox.add(label);
		}
	},

	_addStatusLabels : function(item){
		let issue = this._issuesStorage.issues[item.issueId]

		if(issue.status)
			this._addStatusLabel({item : item, key : 'show-status-item-status', value : issue.status.name});
		if(issue.assigned_to)
			this._addStatusLabel({item : item, key : 'show-status-item-assigned-to', value : issue.assigned_to.name});
		if(issue.tracker)
			this._addStatusLabel({item : item, key : 'show-status-item-tracker', value : issue.tracker.name});
		if(issue.priority)
			this._addStatusLabel({item : item, key : 'show-status-item-priority', value : issue.priority.name});
		if(issue.done_ratio || issue.done_ratio==0)
			this._addStatusLabel({item : item, key : 'show-status-item-done-ratio', value : issue.done_ratio + '%'});
		if(issue.author)
			this._addStatusLabel({item : item, key : 'show-status-item-author', value : issue.author.name});
		if(issue.project)
			this._addStatusLabel({item : item, key : 'show-status-item-project', value : issue.project.name});
	},

	_addIssueMenuItem : function(issue){
		let _this = this;
		let item = new PopupMenu.PopupBaseMenuItem();
		item.issueId = issue.id;

		item.statusLabels = {};
		
		item.actor.add(
			new St.Label({text: '#' + issue.id + ' - ' + issue.subject}),
			{x_fill: true, expand: true});

		item.statusLabelsBox = new St.BoxLayout({style_class: 'ri-popup-menu-item-status-labels'});
		item.actor.add(item.statusLabelsBox);
		this._addStatusLabels(item);

		let removeIssueButton = new St.Button({
            		child: new St.Icon({icon_name: 'list-remove-symbolic', style_class: 'system-status-icon'})
		});
		removeIssueButton.connect('clicked', function(){
			_this._removeIssueClicked(issue);
		});
		item.actor.add(removeIssueButton);

		item.connect('activate', function() {
			let url = _this._settings.get_string('redmine-url') + 'issues/' + issue.id;
			Util.spawn(['xdg-open', url]);
			_this._makeLabelsRead(item);
		});
		
		let projectId = issue.project.id;
		let issueItem = this._issueGroupItems[projectId];
		if(!issueItem){
			issueItem = new PopupMenu.PopupSubMenuMenuItem(issue.project.name);
			this._issueGroupItems[projectId] = issueItem;
			this._issueItems[projectId] = {};
			this.menu.addMenuItem(issueItem, 0);
		}
		this._issueItems[projectId][issue.id] = item;
		issueItem.menu.addMenuItem(item);
	},

	_loadIssue : function(id, foo){
		let request = Soup.Message.new('GET', this._settings.get_string('redmine-url') + 'issues/' + id + '.json');
		request.request_headers.append('X-Redmine-API-Key', this._settings.get_string('api-access-key'));

		session.queue_message(request, function(session, response) {
			if(response.status_code == 200){
				let i=JSON.parse(response.response_body.data).issue;		
				foo({id:i.id, subject:i.subject, status:i.status, assigned_to:i.assigned_to, project:i.project,
					tracker:i.tracker, done_ratio:i.done_ratio, author:i.author,priority:i.priority});
			} else if(response.status_code && response.status_code >= 100) {
				Main.notify(_('Cannot load issue #%s, error status_code=%s').format(id, response.status_code));
			}
		});
	}
};

function init() {
	Convenience.initTranslations();
};

function enable() {
	redmineIssues = new RedmineIssues();
	Main.panel.addToStatusArea('redmineIssues', redmineIssues);
};

function disable() {
	redmineIssues.disconnectSettingChangedSignals();
	redmineIssues.destroy();
	redmineIssues=null;
};

