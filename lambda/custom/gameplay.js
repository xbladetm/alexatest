/*
 * Copyright 2018 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 * http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

'use strict';

const Alexa = require('alexa-sdk');
// Gadget Directives Builder
const GadgetDirectives = require('util/gadgetDirectives.js');
// Basic Animation Helper Library
const BasicAnimations = require('button_animations/basicAnimations.js');
// import the skill settings constants 
const Settings = require('settings.js');


    
// Define a recognizer for button down events that will match when any button is pressed down.
// We'll use this recognizer as trigger source for the "button_down_event" during play
// see: https://developer.amazon.com/docs/gadget-skills/define-echo-button-events.html#recognizers
function configureRecognizer(gadgetId) {
    return { 
        "button_down_recognizer": {
            "type": "match", 
            "fuzzy": false, 
            "anchor": "end", 
            "pattern": [{
                "gadgetIds": [gadgetId],
                "action": "down" 
            }] 
        }
    }; 
}

// Define named events based on the DIRECT_BUTTON_DOWN_RECOGNIZER and the built-in "timed out" recognizer
// to report back to the skill when either of the two buttons in play was pressed and eventually when the
// input handler times out
// see: https://developer.amazon.com/docs/gadget-skills/define-echo-button-events.html#define
const DIRECT_MODE_EVENTS = { 
    "button_down_event": {
        "meets": ["button_down_recognizer"], 
        "reports": "matches", 
        "shouldEndInputHandler": true
    },
    "timeout": {
        "meets": ["timed out"],
        "reports": "history",
        "shouldEndInputHandler": true
    }
};

/* Set up two new animations:
 *    one animation for winning, and one animation for losing */
const WINNING_ANIMATION = {
    'targetGadgets': [],
    'animations': BasicAnimations.PulseAnimation(3, 'light blue', 'dark green')
 };
const LOSING_ANIMATION = {                     
    'targetGadgets': [], 
    'animations': BasicAnimations.PulseAnimation(3, 'orange', 'red')
 };


// ***********************************************************************
//   PLAY_MODE Handlers
//     set up handlers for events that are specific to the Play mode
//     after the user registered the buttons - this is the main mode
// ***********************************************************************
module.exports = Alexa.CreateStateHandler(Settings.SKILL_STATES.PLAY_MODE, {

    'colorIntent': function() {
        console.log("playModeIntentHandlers::colorIntent");

        const uColor = this.event.request.intent.slots.color.value;
        console.log("User color: " + uColor);        

        if (uColor === undefined || Settings.COLOR_SHADES[uColor] === undefined) { 
            this.emit('GlobalHelpHandler');
        } else {
            this.attributes.ColorChoice = uColor;
            var colorShades = Settings.COLOR_SHADES[uColor];
            let randomShadeIndex = pickRandomIndex(colorShades); 
            this.attributes.ReferenceColorShade = colorShades[randomShadeIndex];
            console.log("Selected shade: " + this.attributes.ReferenceColorShade);

            let deviceIds = this.attributes.DeviceIDs;
            deviceIds = deviceIds.slice(-2);
            
            // Build Start Input Handler Directive
            this.response._addDirective(GadgetDirectives.startInputHandler({ 
                    'timeout': 20000,
                    'recognizers': configureRecognizer(deviceIds[1]),
                    'events': DIRECT_MODE_EVENTS 
                } ));
            
            // Save Input Handler Request ID
            this.attributes.CurrentInputHandlerID = this.event.request.requestId;
            console.log("Current Input Handler ID: " + this.attributes.CurrentInputHandlerID);

            // configure light animation for the reference button
            this.response._addDirective(GadgetDirectives.setIdleAnimation({ 
                'targetGadgets': [ deviceIds[0] ], 
                'animations': BasicAnimations.SolidAnimation(1, this.attributes.ReferenceColorShade, 20000)  
            } ));
            // configure light animation for the play button
            this.response._addDirective(GadgetDirectives.setIdleAnimation({ 
                'targetGadgets': [ deviceIds[1] ], 
                'animations': makeRollingAnimation(Settings.COLOR_SHADES[uColor], 1000) 
            } ));
            // for button down, briefly set the color to the reference shade
            this.response._addDirective(GadgetDirectives.setButtonDownAnimation({ 
                'targetGadgets': deviceIds, 
                'animations': BasicAnimations.SolidAnimation(1, this.attributes.ReferenceColorShade, 10) 
            } ));
            // for button up, briefly set the color to the reference shade
            this.response._addDirective(GadgetDirectives.setButtonUpAnimation({ 
                'targetGadgets': deviceIds, 
                'animations': BasicAnimations.SolidAnimation(1,
                            this.attributes.ReferenceColorShade, 10) 
            } ));

            const outputSpeech = "Ok. "+ uColor + " it is. Try to press your button " 
                               + " when the color matches that of my button. "
                               + Settings.WAITING_AUDIO;

            this.response.speak(outputSpeech);
            
            this.emit('GlobalResponseReady', { 'openMicrophone': false }); 
        }
    },
    'InputHandlerEvent.timeout': function() { 
        console.log("playModeIntentHandlers::InputHandlerEvent::timeout");
        
        // The color the user chose
        const uColor = this.attributes.ColorChoice;
        
        const outputSpeech = "Time is up. Would you like to play again?";
        const reprompt = "Say Yes to keep playing, or No to exit";
        
        this.response.speak(outputSpeech).listen(reprompt);
          
        let deviceIds = this.attributes.DeviceIDs;
        deviceIds = deviceIds.slice(-2);
        // play a custom FadeOut animation, based on the user's selected color
        this.response._addDirective(GadgetDirectives.setIdleAnimation({ 
            'targetGadgets': deviceIds, 
            'animations': BasicAnimations.FadeOutAnimation(1, uColor, 2000) 
        }));
        // Reset button animation for skill exit
        this.response._addDirective(GadgetDirectives.setButtonDownAnimation(Settings.DEFUALT_ANIMATIONS.ButtonDown, {'targetGadgets': deviceIds } ));
        this.response._addDirective(GadgetDirectives.setButtonUpAnimation(Settings.DEFUALT_ANIMATIONS.ButtonUp, {'targetGadgets': deviceIds } ));

        // Set Skill End flag
        this.attributes.expectingEndSkillConfirmation = true;
        this.handler.state = Settings.SKILL_STATES.EXIT_MODE;
                            
        this.emit('GlobalResponseReady', { 'openMicrophone': true }); 
    },
    'InputHandlerEvent.button_down_event': function({ buttonInfo } = {}) { 
        console.log("playModeIntentHandlers::InputHandlerEvent::button_down_event");
        let buttonId = buttonInfo.gadgetId; 
        let buttonColor = buttonInfo.color;
        
        const referenceColor = this.attributes.ReferenceColorShade; 
        const playerWon = (referenceColor === buttonColor);
        
        const reprompt = "Say Yes to keep playing, or No to exit"; 
        
        let outputSpeech = playerWon
                         ? Settings.WINNING_AUDIO
                           + "Colors Match! Great job. Would you like to play again?"
                         : Settings.LOSING_AUDIO
                           + "Close, but the colors don't match. " + "Would you like to try again?";
        
        this.response.speak(outputSpeech).listen(reprompt); 
        let deviceIds = this.attributes.DeviceIDs;
        deviceIds = deviceIds.slice(-2);

        let idleAnimation = playerWon ? WINNING_ANIMATION : LOSING_ANIMATION;
        this.response._addDirective(GadgetDirectives.setIdleAnimation( 
                idleAnimation, {'targetGadgets': deviceIds } ));
        this.response._addDirective(GadgetDirectives.setButtonDownAnimation( 
                Settings.DEFUALT_ANIMATIONS.ButtonDown, {'targetGadgets': deviceIds}));
        this.response._addDirective(GadgetDirectives.setButtonUpAnimation(
                Settings.DEFUALT_ANIMATIONS.ButtonUp, {'targetGadgets': deviceIds}));

        // enter the ExitMode and see if the user would like to play again
        this.attributes.expectingEndSkillConfirmation = true; 
        this.handler.state = Settings.SKILL_STATES.EXIT_MODE;
        this.emit('GlobalResponseReady', { 'openMicrophone': true }); 
    },
    'GameEngine.InputHandlerEvent': function() {
        console.log("playModeIntentHandlers::InputHandlerEvent");
        if (this.event.request.originatingRequestId != this.attributes.CurrentInputHandlerID) {
            console.log("Stale input event received. Ignoring!");
            
            this.emit('GlobalResponseReady', { 'openMicrophone': false });
            return;
        }

        let gameEngineEvents = this.event.request.events || [];
        for (var i = 0; i < gameEngineEvents.length; i++) {            
            // GameEngine.InputHandlerEvent requests may contain one or more input events
            // depending on the state of the recognizers defined for the active Input Handler 
            switch (gameEngineEvents[i].name) {
                case 'button_down_event': 
                    this.emit('InputHandlerEvent.button_down_event' +
                                    Settings.SKILL_STATES.PLAY_MODE, {
                                        // pass the id of the button that triggered the event
                                        'buttonInfo': gameEngineEvents[i].inputEvents[0] 
                    });
                    return;

                case 'timeout':                    
                    this.emit('InputHandlerEvent.timeout' + Settings.SKILL_STATES.PLAY_MODE);
                    return;
            }
        }
    },
    'AMAZON.StopIntent': function() {
        this.emit('GlobalStopHandler');
    },
    'AMAZON.CancelIntent': function() {
        this.emit('GlobalStopHandler');
    },
    'AMAZON.HelpIntent': function() {
        this.emit('GlobalHelpHandler');
    },
    'Unhandled': function() {
        console.log("playModeIntentHandlers::Unhandled");      
        this.emit('GlobalDefaultHandler');
    }
});

function makeRollingAnimation(colorShades, duration) {
    let sequence = [];
    for (let i = 0; i < colorShades.length; i++) {
        sequence.push({ "durationMs": duration, "blend": false, "color": colorShades[i] }); 
    }
    for (let i = colorShades.length-2; i > 0; i--) { 
        sequence.push({ "durationMs": duration, "blend": false, "color": colorShades[i] });
    }
    let cycleDuration = sequence.length * duration;
    let cycles = Math.floor(20000 / cycleDuration) + 1; 
    return [{
        "repeat": cycles, 
        "targetLights": ["1"], 
        "sequence": sequence
    }];
};

function pickRandomIndex(arr) {
    let index = (arr && arr.length) ?
    Math.floor(Math.random() * Math.floor(arr.length)) : 0;
    return index;
};

function pickRandomSleep(max_sleep) {
    return Math.random(max_sleep);
};