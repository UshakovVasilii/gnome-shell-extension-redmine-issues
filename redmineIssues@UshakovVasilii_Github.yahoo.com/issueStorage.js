const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

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

        let path = GLib.build_pathv('/', [GLib.get_user_data_dir(), 'redmine-issues']);
        if(!GLib.file_test(path, GLib.FileTest.EXISTS))
            GLib.mkdir_with_parents(path, 493);

        let issuesPath = GLib.build_filenamev([path, 'issues.json']);
        if(!GLib.file_test(issuesPath, GLib.FileTest.EXISTS))
            GLib.file_set_contents(issuesPath, '');

        this._loadIssues();
    },

    _loadIssues : function(){
        let issuesFile = Gio.file_new_for_path(GLib.get_user_data_dir() + '/redmine-issues/issues.json');
        let data = Shell.get_file_contents_utf8_sync(issuesFile.get_path());
        if(data){
            this.issues = JSON.parse(data);
        } else {
            this.issues = {};
        }
    },

    save : function(){
        let file = Gio.file_new_for_path(GLib.get_user_data_dir() + '/redmine-issues/issues.json');
        let out = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        Shell.write_string_to_stream(out, JSON.stringify(this.issues, null, '\t'));
        out.close(null);
    },

    updateIssue : function(issue){
        if(!this.issues[issue.id])
            return false;
        this.issues[issue.id] = issue;
        this.save();
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

        this.issues[issue.id] = issue;
        this.save();
        return true;
    },

    removeIssue : function(issueId) {
        let data = [];
        delete this.issues[issueId];
        this.save();
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
