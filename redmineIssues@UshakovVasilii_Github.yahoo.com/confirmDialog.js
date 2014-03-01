const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;
const Signals = imports.signals;

const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const ConfirmDialog = new Lang.Class({
    Name: 'ConfirmDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function(title, question, callback) {
        this.callback = callback;
        this.question = question;
        this.title = title;
        this.parent();

        let tlabel = new St.Label({
            text: this.title
        });
        this.contentLayout.add(tlabel, {
            x_align: St.Align.MIDDLE,
            y_align: St.Align.START
        });

        let label = new St.Label({
            text: this.question
        });
        this.contentLayout.add(label, {
            y_align: St.Align.MIDDLE
        });

        let buttons = [
            { label: _('Cancel'), action: Lang.bind(this, this._onCancelButton), key: Clutter.Escape},
            { label: _('Ok'), action: Lang.bind(this, this._onOkButton), key: Clutter.Return }
        ];
        this.setButtons(buttons);
    },

    close: function() {
        this.parent();
    },

    _onCancelButton: function() {
        this.close();
    },

    _onOkButton: function() {
        this.callback();
        this.close();
    },

    open: function() {
        this.parent();
    }
});
Signals.addSignalMethods(ConfirmDialog.prototype);

