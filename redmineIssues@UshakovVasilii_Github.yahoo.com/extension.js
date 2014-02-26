
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


let redmineIssues = null;

function RedmineIssues() {
	this._init();
}

RedmineIssues.prototype = {
	__proto__: PanelMenu.Button.prototype,

	_init: function() {
		let _this=this;
		
		this._schema = Convenience.getSettings();
		PanelMenu.Button.prototype._init.call(this, St.Align.START);

		this.actor.add_actor(new St.Icon({
			gicon: Gio.icon_new_for_string(Me.path + '/icons/redmine-issues-symbolic.svg'),
			style_class: 'system-status-icon'
		}));

		this._issueGroupItems = {};
		this._issueItems = {};

		let issues = this._schema.get_strv('issues');
		this._issues = {};
		
		for(let i in issues){
			let issue = JSON.parse(issues[i]);
			this._issues[issue.id] = issue;
			this._addIssueMenuItem(issue);
		}

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
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

		this._schema.connect('changed::show-status-item-status', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-assigned-to', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-tracker', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-priority', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-done-ratio', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-author', Lang.bind(this, this._reloadStatusLabels));
		this._schema.connect('changed::show-status-item-project', Lang.bind(this, this._reloadStatusLabels));
	},

	_reloadStatusLabels : function(){
		global.log('[REDMINE SETTINGS CHANGED]' + this._issueItems);
		for(let groupKey in this._issueItems){
			global.log('[REDMINE GROUP CHANGED]');
			for(let itemKey in this._issueItems[groupKey]){
				global.log('[REDMINE ITEM CHANGED]');
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
		for(let i in this._issues){
			let oldIssue = this._issues[i];
			this._loadIssue(oldIssue.id, function(newIssue) {
				let item = _this._issueItems[oldIssue.project.id][newIssue.id];
				if(oldIssue.status.id != newIssue.status.id)
					item.statusLabel.style_class = 'ri-popup-status-menu-item-new';
				if(oldIssue.assigned_to.id != newIssue.assigned_to.id)
					item.assignedToLabel.style_class = 'ri-popup-status-menu-item-new';
			});
		}
	},

	_addIssueClicked : function() {
		this.menu.close();
		let _this = this;
		let addIssueDialog = new AddIssueDialog.AddIssueDialog(function(issueId){
			_this._loadIssue(issueId, function(issue) {
				let i = _this._issues[issue.id];
				if(!i){
					_this._issues[issue.id] = issue;
					let issues = _this._schema.get_strv('issues');
					issues.push(JSON.stringify(issue));
					_this._schema.set_strv('issues', issues);
					_this._addIssueMenuItem(issue);
				}
			});
		});
		addIssueDialog.open();
        },

	_removeIssueClicked : function(issue){
		delete this._issues[issue.id];
		let issues = [];
		for(let i in this._issues){
			issues.push(JSON.stringify(this._issues[i]));
		}
		this._schema.set_strv('issues', issues);

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
		if(this._schema.get_boolean(params.key)){
			let label = new St.Label({text: params.value, style_class: 'popup-status-menu-item'});
			params.item.statusLabels[params.key] = label;
			params.item.statusLabelsBox.add(label);
		}
	},

	_addStatusLabels : function(item){
		let issue = this._issues[item.issueId]
		this._addStatusLabel({item : item, key : 'show-status-item-status', value : issue.status.name});
		this._addStatusLabel({item : item, key : 'show-status-item-assigned-to', value : issue.assigned_to.name});
		this._addStatusLabel({item : item, key : 'show-status-item-tracker', value : issue.tracker.name});
		this._addStatusLabel({item : item, key : 'show-status-item-priority', value : issue.priority.name});
		this._addStatusLabel({item : item, key : 'show-status-item-done-ratio', value : issue.done_ratio + '%'});
		this._addStatusLabel({item : item, key : 'show-status-item-author', value : issue.author.name});
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
			let url = _this._schema.get_string('redmine-url') + 'issues/' + issue.id;
			Util.spawn(['xdg-open', url]);
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
		let request = Soup.Message.new('GET', this._schema.get_string('redmine-url') + 'issues/' + id + '.json');
		request.request_headers.append('X-Redmine-API-Key', this._schema.get_string('api-access-key'));

		session.queue_message(request, function(session, response) {
			let i=JSON.parse(response.response_body.data).issue;		
			foo({id:i.id, subject:i.subject, status:i.status, assigned_to:i.assigned_to, project:i.project,
				tracker:i.tracker, done_ratio:i.done_ratio, author:i.author,priority:i.priority})
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
	redmineIssues.destroy();
	redmineIssues=null;
};

