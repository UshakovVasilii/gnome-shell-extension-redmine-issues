const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const AddIssueDialog = new Lang.Class({
    Name: 'AddIssueDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function(callback) {
        this.parent();
        this.callback = callback;
        

        let addIssueTitle = new St.Label({
            style_class: 'ri-dialog-subject',
            text: _("Enter issue id")
        });

        this.contentLayout.add(addIssueTitle);

        let issueEntry = new St.Entry();
        issueEntry.label_actor = addIssueTitle;

        this._issueText = issueEntry.clutter_text;
        this.contentLayout.add(issueEntry);
        this.setInitialKeyFocus(this._issueText);

        this.setButtons([
            {label : _('Cancel'),action: Lang.bind(this, this.close), key: Clutter.Escape },
            {label : _('Ok'),action: Lang.bind(this, this._onOkButton)}
        ]);

        this._issueText.connect('key-press-event', Lang.bind(this, function(o, e) {
            let symbol = e.get_key_symbol();
            if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
                this._onOkButton();
            }
        }));
    },

    _onOkButton: function() {
        let text = this._issueText.get_text();
        if(text)
            text = text.replace(/[^0-9]/g, '');
        this.callback(text);
        this.close();
    }
});
