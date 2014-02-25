
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
		//refreshButton.connect('clicked', Lang.bind(this, this._addIssueClicked));
		commandMenuItem.actor.add(refreshButton, { expand: true, x_fill: false });

		this.menu.addMenuItem(commandMenuItem);
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

	_addIssueMenuItem : function(issue){
		let _this = this;
		let item = new PopupMenu.PopupMenuItem('#' + issue.id + ' - ' + issue.subject);

		let removeIssueButton = new St.Button({
            		child: new St.Icon({icon_name: 'list-remove-symbolic', style_class: 'system-status-icon'})
		});
		removeIssueButton.connect('clicked', function(){
			_this._removeIssueClicked(issue);
		});

		item.actor.add(new St.Label({text: issue.assigned_to.name}));
		item.actor.add(new St.Label({text: issue.status.name}));
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
			foo({id:i.id, subject:i.subject, status:i.status, assigned_to:i.assigned_to, project:i.project})
		});
	},

	enable: function() {
		Main.panel.menuManager.addMenu(this.menu);
		Main.panel.addToStatusArea('redmineIssues', this);
	},

	disable: function() {
		Main.panel.menuManager.removeMenu(this.menu);
	},
};

function init() {
	Convenience.initTranslations();
	return new RedmineIssues();
}

