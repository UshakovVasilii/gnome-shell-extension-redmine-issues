const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;
const Signals = imports.signals;

const ModalDialog = imports.ui.modalDialog;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const AddIssueDialog = new Lang.Class({
    Name: 'AddIssueDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function(callback) {
        this.callback = callback;
        this.parent({
            styleClass: 'prompt-dialog'
        });

        let label = new St.Label({
            style_class: 'edit-dialog-label',
            text: _("Add Issue")
        });

        this.contentLayout.add(label, {
            y_align: St.Align.START
        });

        let entry = new St.Entry({
            style_class: 'edit-dialog-entry'
        });
        entry.label_actor = label;

        this._entryText = entry.clutter_text;
        this.contentLayout.add(entry, {
            y_align: St.Align.START
        });
        this.setInitialKeyFocus(this._entryText);

        this.setButtons([
		{label : _('Cancel'),action: Lang.bind(this, this._onCancelButton), key: Clutter.Escape },
		{label : _('Ok'),action: Lang.bind(this, this._onOkButton)}
	]);

        this._entryText.connect('key-press-event', Lang.bind(this, function(o, e) {
            let symbol = e.get_key_symbol();
            if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
                this._onOkButton();
            }
        }));
    },

    close: function() {
        this.parent();
    },

    _onCancelButton: function() {
        this.close();
    },

    _onOkButton: function() {
	let text = this._entryText.get_text();
	if(text)
		text = text.replace(/[^0-9]/g, '');
        this.callback(text);
        this.close();
    }
});
Signals.addSignalMethods(AddIssueDialog.prototype);

