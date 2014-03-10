const Lang = imports.lang;
const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const System = imports.ui.status.system;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const Commands = new Lang.Class({
    Name: 'Commands',

    _init: function(){
        this.commandMenuItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});

        this.addIssueButton = this._createButton('list-add-symbolic');
        this.preferencesButton = this._createButton('preferences-system-symbolic');
        this._addSwitcher(this.addIssueButton, this.preferencesButton);

        this.markAllReadButton = this._createButton('edit-clear-all-symbolic');
        this.removeAllButton = this._createButton('list-remove-all-symbolic');
        this._addSwitcher(this.markAllReadButton, this.removeAllButton);

        this.refreshButton = this._createButton('view-refresh-symbolic');
        this.reloadButton = this._createButton('emblem-synchronizing-symbolic');
        this._addSwitcher(this.refreshButton, this.reloadButton);

        this._makeVisible();
    },

    sync : function(){
        this._makeVisible();
    },

    _makeVisible : function(){
        this.addIssueButton.visible = true;
        this.preferencesButton.visible = true;
        this.markAllReadButton.visible = true;
        this.removeAllButton.visible = true;
        this.refreshButton.visible = true;
        this.reloadButton.visible = true;
    },

    setMinWidth : function(width){
        this.commandMenuItem.actor.style = 'min-width:' + width + 'px';
    },

    _addSwitcher : function(standard, alternate){
        let switcher = new System.AltSwitcher(standard, alternate);
        this.commandMenuItem.actor.add(switcher.actor, { expand: true, x_fill: false });
    },

    _createButton : function(icon_name){
        return new St.Button({
            child: new St.Icon({icon_name: icon_name}),
            style_class: 'system-menu-action'
        });
    },

    destroy : function(){
        this.commandMenuItem.destroy();   
    }

});
