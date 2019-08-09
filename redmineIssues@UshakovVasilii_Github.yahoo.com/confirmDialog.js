const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const St = imports.gi.St;

const ModalDialog = imports.ui.modalDialog;

const Gettext = imports.gettext.domain('redmine-issues');
const _ = Gettext.gettext;

const ConfirmDialog = class extends ModalDialog.ModalDialog {

    constructor(title, message, callback) {
        super();
        this._callback = callback;

        this.contentLayout.add(
            new St.Label({text: title, style_class: 'ri-dialog-subject'}));

        this.contentLayout.add(new St.Label({text: message, style_class: 'ri-dialog-message'}));

        this.setButtons([
            { label: _('Cancel'), action: Lang.bind(this, this.close), key: Clutter.Escape},
            { label: _('Ok'), action: Lang.bind(this, this._onOkButton), key: Clutter.Return }
        ]);
    }

    _onOkButton() {
        this._callback();
        this.close();
    }
};
