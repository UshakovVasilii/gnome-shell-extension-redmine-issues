const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Сonstants = Me.imports.constants;

const IssueStorage = new Lang.Class({
    Name: 'IssueStorage',

    _init: function() {

        let path = GLib.build_pathv('/', [GLib.get_user_data_dir(), 'redmine-issues']);
        if(!GLib.file_test(path, GLib.FileTest.EXISTS))
            GLib.mkdir_with_parents(path, 493);

        this._issuesPath = GLib.build_filenamev([path, 'issues.json']);
        if(!GLib.file_test(this._issuesPath, GLib.FileTest.EXISTS))
            GLib.file_set_contents(this._issuesPath, '');

        this._loadIssues();
    },

    _loadIssues : function(){
        let issuesFile = Gio.file_new_for_path(this._issuesPath);
        let data = Shell.get_file_contents_utf8_sync(issuesFile.get_path());
        if(data){
            this.issues = JSON.parse(data);
        } else {
            this.issues = {};
        }
    },

    _debug : function(message){
        if(this.debugEnabled)
            global.log('[redmine-issues] ' + message);
    },

    save : function(){
        if(!this._hasChanges){
            this._debug('Nothing to save');
            return;
        }
        this._debug('Saving...');
        let file = Gio.file_new_for_path(this._issuesPath);
        let out = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        Shell.write_string_to_stream(out, JSON.stringify(this.issues, null, '\t'));
        out.close(null);
        this._hasChanges = false;
        this._debug('Issues saved');
    },

    updateIssue : function(issue){
        if(!this.issues[issue.id])
            return false;
        this.issues[issue.id] = issue;
        this._hasChanges = true;
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
        Сonstants.LABEL_KEYS.forEach(function(key){
            let value = issue[key];
            if(value || value==0)
                issue.unread_fields.push(key);
        });

        this.issues[issue.id] = issue;
        this._hasChanges = true;
        return true;
    },

    removeIssue : function(issueId) {
        let data = [];
        delete this.issues[issueId];
        this._hasChanges = true;
        return true;
    },

    updateIssueUnreadFields : function(newIssue){
        let oldIssue = this.issues[newIssue.id];
        if(oldIssue.updated_on == newIssue.updated_on)
            return false;

        newIssue.unread_fields = oldIssue.unread_fields;
        if(!newIssue.unread_fields)
            newIssue.unread_fields = [];
        Сonstants.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            if(key == 'done_ratio' && (newIssue.done_ratio || newIssue.done_ratio==0) && oldIssue.done_ratio != newIssue.done_ratio){
                if(newIssue.unread_fields.indexOf(key) < 0)
                    newIssue.unread_fields.push(key);
            } else if(newIssue[key] && (!oldIssue[key] || oldIssue[key].id != newIssue[key].id)) {
                if(newIssue.unread_fields.indexOf(key) < 0)
                    newIssue.unread_fields.push(key);
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
