const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Сonstants = Me.imports.constants;

const IssueItem = new Lang.Class({
    Name: 'IssueItem',

    _init: function(issue){
        this._settings = Convenience.getSettings();
        this.menuItem = new PopupMenu.PopupBaseMenuItem();
        this.issueId = issue.id;

        this.statusLabels = {};
        this.label = new St.Label({text: '#' + issue.id + ' - ' + issue.subject});
        this.label.style = 'max-width:' + this._settings.get_int('max-subject-width') + 'px';
        let unread = issue.unread_fields.length > 0;
        if(unread)
            this.label.add_style_class_name('ri-issue-label-unread');

        this.menuItem.actor.add(this.label,{x_fill: true, expand: true});

        this.statusLabelBox = new St.BoxLayout({style_class: 'ri-popup-menu-item-status-labels'});
        this.menuItem.actor.add(this.statusLabelBox);
        this._addStatusLabels(issue);
        this.buttonBox = new St.BoxLayout();
        this.menuItem.actor.add(this.buttonBox);
        this.markReadButton = new St.Button({
            child: new St.Icon({icon_name: 'object-select-symbolic', style_class: 'system-status-icon'})
        });

        if(unread)
          this.showMarkReadButton();

        this.removeIssueButton = new St.Button({
            child: new St.Icon({icon_name: 'list-remove-symbolic', style_class: 'system-status-icon'})
        });
        this.buttonBox.add(this.removeIssueButton);
    },

    showMarkReadButton : function(){
        if(this.isMarkReadButtonShown)
            return;
        this.buttonBox.insert_child_at_index(this.markReadButton, 0);
        this.isMarkReadButtonShown = true;
    },

    _addStatusLabel : function(key, text, styleClass){
        let label = new St.Label({text: text, style_class: styleClass});
        this.statusLabels[key] = label;
        this.statusLabelBox.add(label);
    },

    _addStatusLabels : function(issue){
        Сonstants.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            if(!this._settings.get_boolean('show-status-item-' + key.replace('_','-')))
                return;
            let styleClass = issue.unread_fields.indexOf(key) >= 0 ? 'ri-popup-status-menu-item-new' : 'popup-status-menu-item';
            if(key == 'done_ratio' && (issue.done_ratio || issue.done_ratio==0)) {
                this._addStatusLabel('done_ratio', issue.done_ratio + '%', styleClass);
            } else if(issue[key]) {
                this._addStatusLabel(key, issue[key].name, styleClass);
            }
        }));
    },

    reloadStatusLabels : function(issue){
        for(let labelKey in this.statusLabels){
            this.statusLabels[labelKey].destroy();
        }
        this.statusLabels = {};
        this._addStatusLabels(issue);
    },

    makeLabelNew : function(key, text){
        let label = this.statusLabels[key];
        if(label) {
            label.style_class = 'ri-popup-status-menu-item-new';
            label.set_text(text);
        } else {
            this._addStatusLabel(key, text, 'ri-popup-status-menu-item-new');
        }
    },

    makeRead : function(){
        Сonstants.LABEL_KEYS.forEach(Lang.bind(this, function(key){
            let label = this.statusLabels[key];
            if(label)
                label.style_class = 'popup-status-menu-item';
        }));
        this.label.remove_style_class_name('ri-issue-label-unread');
        if(this.isMarkReadButtonShown) {
            this.buttonBox.remove_child(this.markReadButton);
            this.isMarkReadButtonShown = false;
        }
    }

});
