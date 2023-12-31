import {
    saveSettingsDebounced,
    substituteParams,
} from '../../../../script.js';
import { debounce } from '../../../utils.js';
import { promptQuietForLoudResponse, sendMessageAs, sendNarratorMessage } from '../../../slash-commands.js';
import { extension_settings, getContext, renderExtensionTemplate } from '../../../extensions.js';
import { registerSlashCommand } from '../../../slash-commands.js';

const extensionName = 'third-party/Extension-Auto-Send';

let autoSendTimer = null;

let defaultSettings = {
    enabled: false,
    timer: 5,
};


//TODO: Can we make this a generic function?
/**
 * Load the extension settings and set defaults if they don't exist.
 */
async function loadSettings() {
    if (!extension_settings.auto_send) {
        console.log('Creating extension_settings.auto_send');
        extension_settings.auto_send = {};
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!extension_settings.auto_send.hasOwnProperty(key)) {
            console.log(`Setting default for: ${key}`);
            extension_settings.auto_send[key] = value;
        }
    }
    populateUIWithSettings();
}

//TODO: Can we make this a generic function too?
/**
 * Populate the UI components with values from the extension settings.
 */
function populateUIWithSettings() {
    $('#auto_send_timer').val(extension_settings.auto_send.timer).trigger('input');
    $('#auto_send_enabled').prop('checked', extension_settings.auto_send.enabled).trigger('input');
}


/**
 * Reset the idle timer based on the extension settings and context.
 */
function resetAutoSendTimer() {
    // never set it if the input box is empty
    if (!$('#send_textarea').val().length) return;
    console.debug('Resetting auto send timer');
    if (autoSendTimer) clearTimeout(autoSendTimer);
    let context = getContext();
    if (!context.characterId && !context.groupID) return;
    if (!extension_settings.auto_send.enabled) return;
    // ensure these are ints
    autoSendTimer = setTimeout(sendAutoSendPrompt, 1000 * extension_settings.auto_send.timer);
}

/**
 * Send a random idle prompt to the AI based on the extension settings.
 * Checks conditions like if the extension is enabled and repeat conditions.
 */
async function sendAutoSendPrompt() {
    if (!extension_settings.auto_send.enabled || !$('#send_textarea').val().length) return;
    // Check repeat conditions and waiting for a response
    if ($('#mes_stop').is(':visible')) {
        //console.debug("Not sending idle prompt due to repeat conditions or waiting for a response.");
        resetAutoSendTimer();
        return;
    }
    // Set the focus back to the textarea
    $('#send_textarea').focus();
    $('#send_but').trigger('click');
    resetAutoSendTimer();
    clearTimeout(autoSendTimer);
}
    // $('#send_textarea').off('input');


/**
 * Load the settings HTML and append to the designated area.
 */
async function loadSettingsHTML() {
    const settingsHtml = renderExtensionTemplate(extensionName, 'dropdown');
    $('#extensions_settings2').append(settingsHtml);
}

/**
 * Update a specific setting based on user input.
 * @param {string} elementId - The HTML element ID tied to the setting.
 * @param {string} property - The property name in the settings object.
 * @param {boolean} [isCheckbox=false] - Whether the setting is a checkbox.
 */
function updateSetting(elementId, property, isCheckbox = false) {
    let value = $(`#${elementId}`).val();
    if (isCheckbox) {
        value = $(`#${elementId}`).prop('checked');
    }

    extension_settings.auto_send[property] = value;
    saveSettingsDebounced();
}

/**
 * Attach an input listener to a UI component to update the corresponding setting.
 * @param {string} elementId - The HTML element ID tied to the setting.
 * @param {string} property - The property name in the settings object.
 * @param {boolean} [isCheckbox=false] - Whether the setting is a checkbox.
 */
function attachUpdateListener(elementId, property, isCheckbox = false) {
    $(`#${elementId}`).on('input', debounce(() => {
        updateSetting(elementId, property, isCheckbox);
    }, 250));
}

/**
 * Handle the enabling or disabling of the auto send extension.
 * Adds or removes the auto send listeners based on the checkbox's state.
 */
function handleAutoSendEnabled() {
    if (!extension_settings.auto_send.enabled) {
        clearTimeout(autoSendTimer);
        removeAutoSendListeners();
    } else {
        resetAutoSendTimer();
        attachAutoSendListeners();
    }
}

/**
 * Setup input listeners for the various settings and actions related to the idle extension.
 */
function setupListeners() {
    const settingsToWatch = [
        ['auto_send_timer', 'timer'],
        ['auto_send_enabled', 'enabled', true],
    ];
    settingsToWatch.forEach(setting => {
        attachUpdateListener(...setting);
    });

    // Idleness listeners, could be made better
    $('#auto_send_enabled').on('input', debounce(handleAutoSendEnabled, 250));

    // Add the idle listeners initially if the idle feature is enabled
    if (extension_settings.auto_send.enabled) {
        attachAutoSendListeners();
    }
}

const debouncedActivityHandler = debounce((event) => {
    // Check if the event target (or any of its parents) has the id "option_continue"
    if ($(event.target).closest('#option_continue').length) {
        return; // Do not proceed if the click was on (or inside) an element with id "option_continue"
    }

    console.debug('Activity detected, resetting auto send timer');
    resetAutoSendTimer();
}, 250);

function attachAutoSendListeners() {
    $(document).on('click keypress', debouncedActivityHandler);
    document.addEventListener('keydown', debouncedActivityHandler);
}

/**
 * Remove idle-specific listeners.
 */
function removeAutoSendListeners() {
    $(document).off('click keypress', debouncedActivityHandler);
    document.removeEventListener('keydown', debouncedActivityHandler);
}

function toggleAutoSend() {
    extension_settings.auto_send.enabled = !extension_settings.auto_send.enabled;
    $('#auto_send_enabled').prop('checked', extension_settings.auto_send.enabled);
    $('#auto_send_enabled').trigger('input');
    toastr.info(`Auto Send mode ${extension_settings.auto_send.enabled ? 'enabled' : 'disabled'}.`);
    resetAutoSendTimer();
}

jQuery(async () => {
    await loadSettingsHTML();
    loadSettings();
    setupListeners();
    if (extension_settings.auto_send.enabled && $('#send_textarea').val().length) {
        resetAutoSendTimer();
    }
    registerSlashCommand('autosend', toggleAutoSend, [], '– toggles auto send mode', true, true);
});
