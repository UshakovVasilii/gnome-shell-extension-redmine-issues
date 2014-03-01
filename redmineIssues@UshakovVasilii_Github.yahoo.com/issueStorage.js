const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;



const IssueStorage = new Lang.Class({
	Name: 'IssueStorage',

	_init: function() {
		this._settings = Convenience.getSettings();
		this.issues = {};

		this._settings.get_strv('issues').forEach(Lang.bind(this, function(s){
			let issue = JSON.parse(s);
			this.issues[issue.id] = issue;
		}));
	},

	updateIssue : function(issue){
		if(!this.issues[issue.id])
			return false;
		let data = [];
		delete this.issues[issue.id];
		data.push(JSON.stringify(issue));
		for(let i in this.issues){
			data.push(JSON.stringify(this.issues[i]));
		}
		this._settings.set_strv('issues', data);
		this.issues[issue.id] = issue;
		return true;
	},

	addIssue : function(issue){
		if(this.issues[issue.id])
			return false;
		let data = this._settings.get_strv('issues');
		data.push(JSON.stringify(issue));
		this._settings.set_strv('issues', data);
		this.issues[issue.id] = issue;
		return true;
	},

	removeIssue : function(issueId) {
		let data = [];
		delete this.issues[issueId];
		for(let i in this.issues){
			data.push(JSON.stringify(this.issues[i]));
		}
		this._settings.set_strv('issues', data);
		return true;		
	}

});
