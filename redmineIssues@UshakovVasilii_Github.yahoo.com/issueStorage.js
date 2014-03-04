const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const LABEL_KEYS = [
    'status',
    'assigned-to',
    'tracker',
    'priority',
    'done-ratio',
    'author',
    'project',
    'fixed-version',
    'category'];

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

    updateIssueToRead : function(issueId){
        let issue = this.issues[issueId];
        issue.unread_fields = [];
        this.updateIssue(issue);
    },

    addIssue : function(issue){
        if(this.issues[issue.id])
            return false;
        issue.unread_fields = ['subject'];
        LABEL_KEYS.forEach(function(key){
            let jsonKey = key.replace('-','_');
            let value = issue[jsonKey];
            if(value || value==0)
                issue.unread_fields.push(jsonKey);
        });
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
    },

    updateIssueUnreadFields : function(newIssue){
        let oldIssue = this.issues[newIssue.id];
        if(oldIssue.updated_on == newIssue.updated_on)
            return false;

        newIssue.unread_fields = oldIssue.unread_fields;
        if(!newIssue.unread_fields)
            newIssue.unread_fields = [];
        LABEL_KEYS.forEach(Lang.bind(this, function(key){
            let jsonKey = key.replace('-','_');
            if(key == 'done-ratio' && (newIssue.done_ratio || newIssue.done_ratio==0) && oldIssue.done_ratio != newIssue.done_ratio){
                if(newIssue.unread_fields.indexOf(jsonKey) < 0)
                    newIssue.unread_fields.push(jsonKey);
            } else if(newIssue[jsonKey] && (!oldIssue[jsonKey] || oldIssue[jsonKey].id != newIssue[jsonKey].id)) {
                if(newIssue.unread_fields.indexOf(jsonKey) < 0)
                    newIssue.unread_fields.push(jsonKey);
            }
        }));

        if(oldIssue.subject != newIssue.subject && newIssue.unread_fields.indexOf('subject') < 0)
            newIssue.unread_fields.push('subject');
        if(oldIssue.updated_on != newIssue.updated_on && newIssue.unread_fields.indexOf('updated_on') < 0)
            newIssue.unread_fields.push('updated_on');

	this.updateIssue(newIssue);
	return true;
    }

});
