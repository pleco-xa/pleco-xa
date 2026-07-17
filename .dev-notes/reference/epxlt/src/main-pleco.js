// pleco's Web Audio engine, from the single built bundle (includes the P23
// browser sink + mic-feed adapters). One file → browser/Vite-loadable without
// walking the engine src tree. (Serving from the epxlt dir still needs Vite's
// server.fs.allow to include the monorepo root, or copy dist/engine.js in.)
import {
  PlecoAudioContext,
  PlecoBrowserAudioSink,
  createBrowserMicFeed,
} from '../../../../packages/pleco-xa/dist/engine.js'
 /*
        ====================================================
        ECHOPLEX DIGITAL PRO PLUS - MINIMAL STARTING POINT
        ====================================================
        This file is organized linearly by hardware control.
        It contains the core class and the logic for each function.
        VERSION: RECORD button final fixes applied.
        */
        // ============================================================================
        // ENGINE DEFINITIONS (Catch-all for Layers & Processors)
        // ============================================================================
        // [pleco] Recorder AudioWorklet removed — capture + cycle-detect moved to
        // the main thread (mic-feed onChunk tap + loop-clock cycle timer). No audio
        // worklet processor module string lives in this build.
        // Map of which segments are lit for each numeral
        const SEGMENT_MAP = {
            '0':['a','b','c','d','e','f'], '1':['b','c'], '2':['a','b','g','e','d'],
            '3':['a','b','g','c','d'], '4':['f','g','b','c'], '5':['a','f','g','c','d'],
            '6':['a','f','g','c','d','e'], '7':['a','b','c'], '8':['a','b','c','d','e','f','g'],
            '9':['a','b','c','d','f','g'], '.':['dot'],
            'P':['a','b','e','f','g'], 'L':['d','e','f'], 'A':['a','b','c','e','f','g'], // For PLAY, P1, P2 etc.
            'Y':['b','c','d','f','g'], 'S':['a','f','g','c','d'], 'R':['a','e','f','g'], // For SAF, rEV
            'E':['a','d','e','f','g'], 'V':['b','c','d','e','f'], // For rEV
            'I':['e','f'], 'N':['a','b','c','e','f'], 'U':['b','c','d','e','f'], // For INS, UNDO, UNK
            'K':['e','f','g'], 'O':['a','b','c','d','e','f'], 'T':['d','e','f','g'], // For MUTE, NO LP
            'D':['b','c','d','e','g'], 'F':['a','e','f','g'], 'H':['b','c','e','f','g'], // For Fd, rhr, h.SP
            'r':['e','g'], 'h':['c','e','f','g'],
            // New mappings for parameter display names
            'd':['b','c','d','e','g'], // For dEL
            'C':['a','d','e','f'], // For CYC, Cnt, Ctr
            '8':['a','b','c','d','e','f','g'], // For 8th (already exists)
            't':['d','e','f','g'], // For toG, ti
            'o':['c','d','e','g'], // For not (o from nOt)
            's':['a','c','d','f','g'], // For SUS, StA
            'p':['a','b','e','f','g'], // For SP, StP
            'f':['a','e','f','g'], // For f (from Fd)
            'n':['c','e','g'], // For CnF
            'l':['d','e'], // For CLP
            'm':['a','c','e','g'], // For dUMP
            'L':['d','e','f'], // For LOAD (already exists)
            'b':['c','d','e','f','g'], // For Sub
            'z':['a','b','d','e','g'], // For Pr.E (P is already there, r is there, E is there)
            'W':['b','c','e','f','g'], // For SWI (Switches)
            'M':['a','b','c','e','f'], // For MID (MIDI)
            'X':['b','c','e','f','g'], // For EXP (ExpertMode)
            'U':['b','c','d','e','f'], // For Stu (StutterMode)
            'G':['a','c','d','e','f'], // For toG (Toggle)
        };
        // ============================================================================
        // PARAMETER MATRIX DATA
        // ============================================================================
        const PARAMETER_MATRIX_DATA = {
            // P1: Timing Row
            P1_Timing: {
                ledId: 'timing-led',
                displayName: 'TIM', // Display name for the row itself
                params: {
                    'record': { displayName: 'LOP', options: ['LOP', 'dEL', 'EXP', 'Stu', 'Out', 'In', 'rPL', 'FLI'], default: 'LOP', fullName: 'Loop/Delay', description: 'Determines the routing of the pedal in the Feedback Jack.' },
                    'overdub': { displayName: 'OFF', options: ['OFF', 'CYC', '8th', 'LOP'], default: 'OFF', fullName: 'Quantize', description: 'Synchronizes actions to rhythmic points.' },
                    'multiply': { displayName: '8', options: [8, 4, 2, 6, 12, 16, 32, 64, 128, 256, 1, 2, 3, 5, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96], isDataWheel: true, default: 8, fullName: '8ths/Cycle', description: 'Number of 8th notes per cycle for synchronization.' },
                    'insert': { displayName: 'Out', options: ['Off', 'Ous', 'In', 'Out'], default: 'Out', fullName: 'SyncMode', description: 'Configures synchronization with external MIDI clocks.' },
                    'mute': { displayName: '0', options: [0, 1, 2, 3, 4, 5, 6, 7, 8], isDataWheel: true, default: 0, fullName: 'TrigThreshold', description: 'Audio level required to trigger recording.' },
                    'undo': { displayName: 'rEV', options: ['rEV', 'Fd'], default: 'rEV', fullName: 'Reverse', description: 'Reverses the playback direction of the loop.' }, // Note: This is specifically for the Reverse function under Timing row
                    'nextloop': { displayName: 'S.Pt', options: ['S.Pt'], default: 'S.Pt', fullName: 'StartPoint', description: 'Sets the loop\'s start point.' }
                }
            },
            // P2: Switches Row
            P2_Switches: {
                ledId: 'switches-led',
                displayName: 'SWI', // Display name for the row itself
                params: {
                    'record': { displayName: 'toG', options: ['toG', 'SUS', 'SAF'], default: 'toG', fullName: 'RecordMode', description: 'Determines how the Record button behaves.' },
                    'overdub': { displayName: 'toG', options: ['toG', 'SUS'], default: 'toG', fullName: 'OverdubMode', description: 'Configures the Overdub button behavior.' },
                    'multiply': { displayName: 'OFF', options: ['OFF', 'RND'], default: 'OFF', fullName: 'RoundMode', description: 'Determines whether actions round off to the nearest cycle.' },
                    'insert': { displayName: 'InS', options: ['InS', 'rhr', 'rPL', 'Sub', 'rEV', 'h.SP', 'SUS'], default: 'InS', fullName: 'InsertMode', description: 'Configures the Insert button functionality.' },
                    'mute': { displayName: 'Cnt', options: ['Cnt', 'StA'], default: 'Cnt', fullName: 'MuteMode', description: 'Determines how sound is restarted after it is muted.' },
                    'undo': { displayName: 'StP', options: ['StP', 'PLY'], default: 'StP', fullName: 'Overflow', description: 'Configures how the unit handles memory overflow.' },
                    'nextloop': { displayName: 'Pr.E', options: ['Pr.E'], default: 'Pr.E', fullName: 'Presets', description: 'Accesses the Preset Editor.' }
                }
            },
            // P3: MIDI Row
            P3_MIDI: {
                ledId: 'midi-led',
                displayName: 'MID', // Display name for the row itself
                params: {
                    'record': { displayName: '1', options: Array.from({length:16}, (_,i)=>i+1), isDataWheel: true, default: 1, fullName: 'Channel', description: 'Sets the MIDI channel for all MIDI functions.' },
                    'overdub': { displayName: 'not', options: ['not', 'Ctr', 'OFF'], default: 'not', fullName: 'ControlSource', description: 'Sets up MIDI control of Echoplex operations.' },
                    'multiply': { displayName: '36', options: Array.from({length:100}, (_,i)=>i), isDataWheel: true, default: 36, fullName: 'Source #', description: 'Sets the starting MIDI note/controller number for commands.' },
                    'insert': { displayName: '7', options: Array.from({length:99}, (_,i)=>i+1), isDataWheel: true, default: 7, fullName: 'VolumeCont', description: 'Assigns a MIDI controller for volume control.' },
                    'mute': { displayName: '1', options: Array.from({length:99}, (_,i)=>i+1), isDataWheel: true, default: 1, fullName: 'FeedBkCont', description: 'Assigns a MIDI controller for feedback control.' },
                    'undo': { displayName: 'dUMP', options: ['dUMP'], default: 'dUMP', fullName: 'Dump', description: 'Sends a MIDI dump of the current loop.' },
                    'nextloop': { displayName: 'LOAD', options: ['LOAD'], default: 'LOAD', fullName: 'Load', description: 'Receives a MIDI dump to load a loop.' }
                }
            },
            // P4: Loops Row
            P4_Loops: {
                ledId: 'loops-led',
                displayName: 'LOO', // Display name for the row itself
                params: {
                    'record': { displayName: '1', options: Array.from({length:16}, (_,i)=>i+1), isDataWheel: true, default: 1, fullName: 'MoreLoops', description: 'Sets the number of loops available in memory.' },
                    'overdub': { displayName: 'OFF', options: ['OFF', 'On'], default: 'OFF', fullName: 'AutoRecord', description: 'Automatically starts recording when entering an empty loop.' },
                    'multiply': { displayName: 'OFF', options: ['OFF', 'ti', 'Snd'], default: 'OFF', fullName: 'LoopCopy', description: 'Enables copying of loops between memory locations.' },
                    'insert': { displayName: 'OFF', options: ['OFF', 'CnF', 'CYC', 'CCY', 'LOP', 'CLP'], default: 'OFF', fullName: 'SwitchQuant', description: 'Quantizes loop switching to rhythmic points.' },
                    'mute': { displayName: 'OFF', options: ['OFF', 'On'], default: 'OFF', fullName: 'Velocity', description: 'Enables velocity sensitivity for MIDI control.', currentValue: 'OFF' },
                    'undo': { displayName: 'run', options: ['run', 'OnE', 'StA', 'Att'], default: 'run', fullName: 'SamplerStyle', description: 'Configures the unit for sampler-style playback.' },
                    'nextloop': { displayName: '120', options: Array.from({length:278}, (_,i)=>i+1), isDataWheel: true, default: 120, fullName: 'Tempo', description: 'Sets the tempo for synchronization.' } // Tempo range 1-278 for DataWheel
                }
            }
        };
        // Conceptual Layers (State and low-level logic will live here)
        const SignalChainLayer = {
            audioContext: null,
            audioNodes: {
                inputGain: null,
                outputGain: null,
                feedbackGain: null,
                microphoneSource: null,
                recorderWorklet: null,
                mixGain: null,
                inputAnalyser: null,
                feedbackAnalyser: null,
            }
        };
        const ControllerLayer = {
            state: {
                loopState: 'idle',
                insertMode: 'InS', 
                isMuted: false, 
                isReversed: false,
                isHalfSpeed: false,
                activeParameter: null,
                activeParameterRow: null,
                multiplyCycleCount: 0,
                multiplyBaseCycleLength: 0,
                insertStartTime: 0,
                isSusInsert: false, // For SUS mode
            }
        };
        const BufferLayer = {
            state: {
                loops: [
                    { 
                        buffer: null, // Keep for backward compatibility
                        baseBuffer: null, // Original recorded loop 
                        overdubLayers: [], // Array of {buffer, feedbackLevel}
                        currentMix: null, // Dynamically generated mix
                        playbackNode: null, 
                        undoStack: [],
                        feedbackDecayTimer: null
                    }
                ],
                recordedChunks: [],
                overdubChunks: [],
                multiplyChunks: [],
                insertChunks: [], // For Insert functionality
            }
        };
        const FeedbackLayer = {
            state: {
                timerInterval: null,
                timerStartTime: null,
                multiplyDisplayInterval: null,
                insertDisplayInterval: null,
            }
        };

        class EchoplexMinimal {
            constructor() {
                this.state = {
                    power: false,
                    parameterMode: 0, // 0=PLAY, 1=P1 (Timing), 2=P2 (Switches), 3=P3 (MIDI), 4=P4 (Loops)
                    controlValues: {
                        input: 100,
                        output: 100,
                        mix: 64, // Halfway point for mix
                        feedback: 127 // Default feedback as per manual
                    },
                    parameters: {}, // Holds current values of all parameters
                };
                this.elements = {};
                this.displayTimeout = null;
                this.MAX_LOOP_SECONDS = 198;
                this.animationFrameId = null; // For level monitoring
                this.initializeParameters(); // Initialize all parameters from the matrix
            }
            initializeParameters() {
                for (const rowKey in PARAMETER_MATRIX_DATA) {
                    const row = PARAMETER_MATRIX_DATA[rowKey];
                    for (const paramKey in row.params) {
                        const param = row.params[paramKey];
                        // Use a unique key for each parameter, e.g., 'P1_Timing_Loop/Delay'
                        const uniqueParamKey = `${rowKey}_${paramKey}`;
                        // Set current value from default if not already set
                        this.state.parameters[uniqueParamKey] = {
                            ...param, // Copy all properties
                            currentValue: param.default // Ensure current value is set from default
                        };
                    }
                }
                // Initialize InsertMode from the parameters state
                const insertModeParam = this.state.parameters['P2_Switches_insert'];
                if (insertModeParam) {
                    ControllerLayer.state.insertMode = insertModeParam.currentValue;
                }
            }
            async init() {
                console.log('🎛️ Initializing Echoplex...');
                if (document.readyState === 'loading') {
                    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
                }
                this.setupElements();
                this.setupEventListeners();
                console.log('✅ Echoplex Ready');
            }
            setupElements() {
                this.elements = {
                    powerButton: document.getElementById('power-button'), // Still 'power-button'
                    mainInterface: document.getElementById('main-interface'), // Still 'main-interface'
                    echoplexContainer: document.getElementById('echoplex-container'), // New main visual container
                    waveformCanvas: document.getElementById('waveform-canvas'), // New
                    inputLevelLED: document.getElementById('input-level'), // New
                    feedbackLevelLED: document.getElementById('feedback-level'), // New
                    ledDisplayContainer: document.getElementById('display'), // Still 'display' (inner flex row)
                    leftDisplay: document.getElementById('left-display'), // New
                    multipleDisplay: document.getElementById('multiple-display'), // Still 'multiple-display'
                    autoUndoLED: document.getElementById('autoUndoLED'), // New
                    tempoDotLeft: document.getElementById('tempoDotLeft'), // New
                    tempoDotRight: document.getElementById('tempoDotRight'), // New
                    // Knobs - now have data-param
                    inputKnob: document.querySelector('.knob[data-param="input"]'),
                    outputKnob: document.querySelector('.knob[data-param="output"]'),
                    mixKnob: document.querySelector('.knob[data-param="mix"]'),
                    feedbackKnob: document.querySelector('.knob[data-param="feedback"]'),
                    // Buttons - now have data-function on the parent .control.button, but LED is inside
                    parametersBtn: document.querySelector('.button[data-function="parameters"]'),
                    recordBtn: document.querySelector('.button[data-function="record"]'),
                    overdubBtn: document.querySelector('.button[data-function="overdub"]'),
                    multiplyBtn: document.querySelector('.button[data-function="multiply"]'),
                    insertBtn: document.querySelector('.button[data-function="insert"]'),
                    muteBtn: document.querySelector('.button[data-function="mute"]'),
                    undoBtn: document.querySelector('.button[data-function="undo"]'),
                    nextloopBtn: document.querySelector('.button[data-function="nextloop"]'),
                    // Row Indicator LEDs - now have specific IDs
                    timingLed: document.getElementById('timing-led'),
                    switchesLed: document.getElementById('switches-led'),
                    midiLed: document.getElementById('midi-led'),
                    loopsLed: document.getElementById('loops-led'),
                };
                this.buildLedDisplay();
                this.buildLeftAndMultipleDisplays(); // Build the new 7-segment displays
            }
            buildLeftAndMultipleDisplays() {
                const createDigitElements = (container) => {
                    if (!container) return [];
                    container.innerHTML = ''; // Clear any previous content
                    const DIGITS = container.id === 'left-display' ? 1 : 2; // 1 digit for left, 2 for multiple
                    for (let i = 0; i < DIGITS; i++) {
                        const digit = document.createElement('div');
                        digit.className = 'digit';
                        ['a','b','c','d','e','f','g'].forEach(cls => {
                            const seg = document.createElement('div');
                            seg.className = `segment ${cls}`;
                            digit.appendChild(seg);
                        });
                        if (container.id !== 'left-display') { // Only multiple display has dots
                            const dot = document.createElement('div');
                            dot.className = 'dot';
                            digit.appendChild(dot);
                        }
                        container.appendChild(digit);
                    }
                    return Array.from(container.querySelectorAll('.digit'));
                };
                this.elements.leftDisplayDigits = createDigitElements(this.elements.leftDisplay);
                this.elements.multipleDisplayDigits = createDigitElements(this.elements.multipleDisplay);
            }
            
            buildLedDisplay() {
                const display = this.elements.ledDisplayContainer;
                if (!display) return;
                display.innerHTML = ''; // Clear any previous content
                const DIGITS = 3; // three fixed digit positions
                for (let i = 0; i < DIGITS; i++) {
                    const digit = document.createElement('div');
                    digit.className = 'digit';
                    ['a','b','c','d','e','f','g'].forEach(cls => {
                        const seg = document.createElement('div');
                        seg.className = `segment ${cls}`;
                        digit.appendChild(seg);
                    });
                    const dot = document.createElement('div');
                    dot.className = 'dot';
                    dot.classList.add('hidden'); // Initially hidden, only shown if needed
                    digit.appendChild(dot);
                    display.appendChild(digit);
                }
                this.elements.digitEls = Array.from(display.querySelectorAll('.digit'));
            }
            setupEventListeners() {
                this.elements.powerButton.addEventListener('click', () => this.togglePower());
                this.elements.parametersBtn.addEventListener('click', () => this.handleParameters());
                
                // RECORD BUTTON with long-press logic
                let recordPressTimer = null;
                this.elements.recordBtn.addEventListener('mousedown', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('record', e); 
                        return;
                    }
                    this.updateLed('record', 'orange');
                    recordPressTimer = setTimeout(() => {
                        this.resetLoop();
                        recordPressTimer = null;
                        this.updateLed('record', 'ready');
                    }, 500); 
                });
                this.elements.recordBtn.addEventListener('mouseup', () => {
                    if (recordPressTimer) {
                        clearTimeout(recordPressTimer);
                        if (this.state.parameterMode === 0) {
                            this.handleRecordButton();
                        }
                    }
                    if (this.state.parameterMode === 0 && ControllerLayer.state.loopState !== 'recording' && ControllerLayer.state.loopState !== 'playing') {
                        this.updateLed('record', 'ready');
                    }
                });
                
                this.elements.recordBtn.addEventListener('mouseleave', () => {
                    if (recordPressTimer) {
                        clearTimeout(recordPressTimer);
                        recordPressTimer = null;
                        if (this.state.parameterMode === 0 && ControllerLayer.state.loopState !== 'recording' && ControllerLayer.state.loopState !== 'playing') {
                            this.updateLed('record', 'ready');
                        }
                    }
                });
                
                this.elements.overdubBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('overdub', e);
                        return;
                    }
                    this.handleOverdubButton();
                });
                
                this.elements.multiplyBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('multiply', e);
                        return;
                    }
                    this.handleMultiplyButton();
                });
                
                this.elements.insertBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('insert', e);
                        return;
                    }
                    this.handleInsertButton();
                });
                
                this.elements.insertBtn.addEventListener('mousedown', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) return;
                    
                    // Handle SUS mode for Insert
                    if (ControllerLayer.state.insertMode === 'SUS') {
                        ControllerLayer.state.isSusInsert = true;
                        this.startInsert();
                    }
                });
                
                this.elements.insertBtn.addEventListener('mouseup', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) return;
                    
                    // Handle SUS mode for Insert
                    if (ControllerLayer.state.insertMode === 'SUS' && ControllerLayer.state.isSusInsert) {
                        ControllerLayer.state.isSusInsert = false;
                        this.stopInsert();
                    }
                });
                
                this.elements.muteBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('mute', e);
                        return;
                    }
                    this.handleMuteButton();
                });
                
                this.elements.undoBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('undo', e);
                        return;
                    }
                    this.handleUndoButton();
                });
                
                this.elements.nextloopBtn.addEventListener('click', (e) => {
                    if (!this.state.power) return;
                    if (this.state.parameterMode > 0) {
                        this.handleParameterButtonPress('nextloop', e);
                        return;
                    }
                    this.showTemporaryMessage('NXT L', 1000);
                    this.updateLed('nextloop', 'on');
                    setTimeout(() => this.updateLed('nextloop', 'off'), 500);
                });
                
                this.setupKnob(this.elements.inputKnob);
                this.setupKnob(this.elements.outputKnob);
                this.setupKnob(this.elements.mixKnob);
                this.setupKnob(this.elements.feedbackKnob);
            }
            
            togglePower() {
                this.state.power = !this.state.power;
                this.elements.powerButton.classList.toggle('powered-on', this.state.power);
                this.elements.mainInterface.classList.toggle('powered-off', !this.state.power);
                if (this.state.power) {
                    this.powerOnSequence();
                } else {
                    this.powerOff();
                }
            }
            async powerOnSequence() {
                this.flashStartupLEDs();
                await this.initializeAudioSystem();
                this.showTemporaryMessage('1.0', 1000, () => {
                    this.showTemporaryMessage('198', 2000, () => {
                        this.renderLedDisplay('.');
                    });
                });
                this.updateParameterLEDs();
                
                this.updateLed('record', 'ready');
                this.updateLed('overdub', 'ready');
                this.updateLed('multiply', 'ready');
                this.updateLed('insert', 'ready');
                this.updateLed('mute', 'ready');
                this.updateLed('undo', 'off'); 
                this.updateLed('nextloop', 'ready');
                
                this.applyKnobToAudio('input', this.state.controlValues.input);
                this.applyKnobToAudio('output', this.state.controlValues.output);
                this.applyKnobToAudio('mix', this.state.controlValues.mix);
                this.applyKnobToAudio('feedback', this.state.controlValues.feedback);
                
                this.startLevelMonitoring();
                
                this.renderLeftDisplay(1); 
            }
            powerOff() {
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.playbackNode) {
                    loop.playbackNode.stop();
                    loop.playbackNode.disconnect();
                    loop.playbackNode = null;
                }
                ControllerLayer.state.loopState = 'idle';
                ControllerLayer.state.isMuted = false;
                ControllerLayer.state.isReversed = false;
                ControllerLayer.state.multiplyCycleCount = 0;
                ControllerLayer.state.multiplyBaseCycleLength = 0;
                ControllerLayer.state.isSusInsert = false;
                ControllerLayer.state.activeParameter = null;
                ControllerLayer.state.activeParameterRow = null;
                this.state.parameterMode = 0;
                this.updateParameterLEDs();
                this.updateMultipleDisplay('');
                this.renderLedDisplay('');
                this.renderLeftDisplay('');
                this.renderMultipleDisplay('');
                
                const buttonFunctions = ['record', 'overdub', 'multiply', 'insert', 'mute', 'undo', 'nextloop'];
                buttonFunctions.forEach(name => this.updateLed(name, 'off'));
                
                this.updateLed('loops-led', 'off');  
                this.updateLed('midi-led', 'off');
                this.updateLed('switches-led', 'off');
                this.updateLed('timing-led', 'off');
                
                this.updateLed('input-level', 'off');
                this.updateLed('feedback-level', 'off');
                
                this.stopLevelMonitoring();
                if (SignalChainLayer.audioContext) {
                    SignalChainLayer.audioContext.close().then(() => {
                        SignalChainLayer.audioContext = null;
                        SignalChainLayer.audioNodes = {};
                    });
                }
            }
            flashStartupLEDs() {
                const buttonFunctions = ['record', 'overdub', 'multiply', 'insert', 'mute', 'undo', 'nextloop'];
                buttonFunctions.forEach((functionName, index) => {
                    const led = document.querySelector(`[data-function="${functionName}"] .status-led`);
                    if (led) {
                        setTimeout(() => {
                            led.setAttribute('data-hw-state', 'on');
                            setTimeout(() => led.setAttribute('data-hw-state', 'off'), 400);
                        }, index * 80);
                    }
                });
            }
            async initializeAudioSystem() {
                if (SignalChainLayer.audioContext) return;
                try {
                    const sink = new PlecoBrowserAudioSink({ sampleRate: 44100 });
                    const audioCtx = new PlecoAudioContext({ sampleRate: sink.sampleRate, latencyHint: 'interactive', sink });
                    if (audioCtx.state === 'suspended') await audioCtx.resume();
                    
                    const mic = await createBrowserMicFeed({
                        nativeContext: sink.nativeContext,
                        channelCount: 1,
                        onChunk: (samples) => {
                            const s = ControllerLayer.state.loopState;
                            if (s !== 'recording' && s !== 'overdubbing' && s !== 'multiplying' && s !== 'inserting' && s !== 'replacing') return;
                            // Fidelity: the original captured POST-inputGain — the worklet was fed by
                            // inputGain.connect(worklet,0,0), so recorded PCM = mic * (input/127). The
                            // mic-feed tap carries RAW pre-inputGain mic, so apply the input-level gain here.
                            const ig = SignalChainLayer.audioNodes.inputGain;
                            const g = ig ? ig.gain.value : 1;
                            const scaled = new Float32Array(samples.length);
                            for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * g;
                            if (s === 'recording') BufferLayer.state.recordedChunks.push(scaled);
                            else if (s === 'overdubbing') BufferLayer.state.overdubChunks.push(scaled);
                            else if (s === 'multiplying') BufferLayer.state.multiplyChunks.push(scaled);
                            else if (s === 'inserting') BufferLayer.state.insertChunks.push(scaled);
                            else if (s === 'replacing') {
                                const lp = BufferLayer.state.loops[0];
                                if (lp && lp.replaceInputSamples) lp.replaceInputSamples.push(...scaled);
                            }
                        },
                    });
                    SignalChainLayer.audioNodes.microphoneSource = audioCtx.createMediaStreamSource(mic.stream);
                    
                    // [pleco] recorder AudioWorklet removed — no module Blob, no object URL,
                    // no worklet node. recorderWorklet stays null; capture is the mic-feed
                    // onChunk tap and cycle-detect is the loop clock.
                    
                    SignalChainLayer.audioNodes.inputGain = audioCtx.createGain();
                    SignalChainLayer.audioNodes.outputGain = audioCtx.createGain();
                    SignalChainLayer.audioNodes.mixGain = audioCtx.createGain();
                    SignalChainLayer.audioNodes.feedbackGain = audioCtx.createGain();
                    SignalChainLayer.audioNodes.inputAnalyser = audioCtx.createAnalyser();
                    SignalChainLayer.audioNodes.inputAnalyser.fftSize = 256;
                    SignalChainLayer.audioNodes.inputAnalyser.smoothingTimeConstant = 0.1;
                    SignalChainLayer.audioNodes.feedbackAnalyser = audioCtx.createAnalyser();
                    SignalChainLayer.audioNodes.feedbackAnalyser.fftSize = 256;
                    SignalChainLayer.audioNodes.feedbackAnalyser.smoothingTimeConstant = 0.1;
    
                    // Correct Audio Graph Setup
                    // Input path
                    SignalChainLayer.audioNodes.microphoneSource.connect(SignalChainLayer.audioNodes.inputGain);
                    SignalChainLayer.audioNodes.inputGain.connect(SignalChainLayer.audioNodes.inputAnalyser); // For input level monitoring
    
                    // Main Output Path
                    // The worklet output is now silent. The mix happens via gain nodes.
                    SignalChainLayer.audioNodes.mixGain.connect(SignalChainLayer.audioNodes.outputGain); // Mix to Output
                    SignalChainLayer.audioNodes.outputGain.connect(audioCtx.destination); // Output to speakers
    
                    // Monitoring Path for feedback/loop level
                    SignalChainLayer.audioNodes.mixGain.connect(SignalChainLayer.audioNodes.feedbackAnalyser);
                    
                    // Set initial gain values
                    SignalChainLayer.audioNodes.inputGain.gain.value = this.state.controlValues.input / 127;
                    SignalChainLayer.audioNodes.outputGain.gain.value = this.state.controlValues.output / 127;
                    this.applyKnobToAudio('mix', this.state.controlValues.mix);
                    SignalChainLayer.audioNodes.feedbackGain.gain.value = this.state.controlValues.feedback / 127;
                    
                    SignalChainLayer.audioContext = audioCtx;
                } catch (error) {
                    console.error('Audio Init Error:', error);
                    this.showTemporaryMessage('ERR', 2000);
                }
            }
            
            handleParameters() {
                if (!this.state.power) return;
                
                this.state.parameterMode = (this.state.parameterMode + 1) % 5;
                const rowNamesForMainDisplay = ['PLAY', 'TIM', 'SWI', 'MID', 'LOO'];
                const pDisplayNamesForMultiple = ['', 'P 1', 'P 2', 'P 3', 'P 4'];
                this.updateParameterLEDs();
                if (this.state.parameterMode > 0) {
                    const rowKeys = ['P1_Timing', 'P2_Switches', 'P3_MIDI', 'P4_Loops'];
                    ControllerLayer.state.activeParameterRow = PARAMETER_MATRIX_DATA[rowKeys[this.state.parameterMode - 1]];
                    ControllerLayer.state.activeParameter = null;
                    this.updateParameterButtonLEDs();
                    this.showTemporaryMessage(rowNamesForMainDisplay[this.state.parameterMode], 1500);  
                    
                    this.renderLeftDisplay('');
                    this.renderMultipleDisplay(pDisplayNamesForMultiple[this.state.parameterMode]);
                } else {
                    this.resetParameterButtonLEDs();
                    ControllerLayer.state.activeParameter = null;
                    ControllerLayer.state.activeParameterRow = null;
                    this.renderLedDisplay(this.getDefaultDisplay());
                    this.renderLeftDisplay(1);
                    this.renderMultipleDisplay('');
                }
            }
            updateParameterLEDs() {
                const leds = ['timing-led', 'switches-led', 'midi-led', 'loops-led'];
                leds.forEach((id, index) => {
                    if (this.state.parameterMode === (index + 1)) {
                        this.updateLed(id, 'orange');
                    } else {
                        this.updateLed(id, 'off');
                    }
                });
            }
            updateParameterButtonLEDs() {
                const allFunctionButtons = ['record', 'overdub', 'multiply', 'insert', 'mute', 'undo', 'nextloop'];
                allFunctionButtons.forEach(btnName => this.updateLed(btnName, 'off'));
                if (ControllerLayer.state.activeParameterRow) {
                    for (const buttonFunction in ControllerLayer.state.activeParameterRow.params) {
                        this.updateLed(buttonFunction, 'on');
                    }
                }
            }
            resetParameterButtonLEDs() {
                this.updateLed('record', ControllerLayer.state.loopState === 'recording' ? 'recording' : 'ready');
                this.updateLed('overdub', ControllerLayer.state.loopState === 'overdubbing' ? 'recording' : 'ready');
                this.updateLed('multiply', ControllerLayer.state.loopState === 'multiplying' ? 'recording' : 'ready');
                this.updateLed('insert', ControllerLayer.state.isReversed ? 'recording' : 'ready');
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
                this.updateLed('undo', BufferLayer.state.loops[0].undoStack.length > 0 ? 'ready' : 'off');
                this.updateLed('nextloop', 'ready');
                this.updateLed('loops-led', 'off');
                this.updateLed('midi-led', 'off');
                this.updateLed('switches-led', 'off');
                this.updateLed('timing-led', 'off');
            }
            
            handleParameterButtonPress(buttonFunction, event) {
                if (!this.state.power || this.state.parameterMode === 0) return;
                
                // Special case for reverse, which should trigger instantly from P1.
                if (this.state.parameterMode === 1 && buttonFunction === 'undo') {
                  this.toggleReverse();
                  return;
                }
      
                const currentRowKey = ['P1_Timing', 'P2_Switches', 'P3_MIDI', 'P4_Loops'][this.state.parameterMode - 1];
                const currentRowData = PARAMETER_MATRIX_DATA[currentRowKey];
                if (!currentRowData || !currentRowData.params[buttonFunction]) {
                    this.showTemporaryMessage('ERR', 500);
                    return;
                }
      
                const paramInfo = currentRowData.params[buttonFunction];
                const uniqueParamKey = `${currentRowKey}_${buttonFunction}`;
                let currentParamState = this.state.parameters[uniqueParamKey];
                let longPressTimer = null;
                const resetButton = event.currentTarget; 
                const startLongPressTimer = () => {
                    longPressTimer = setTimeout(() => {
                        currentParamState.currentValue = paramInfo.default;
                        this.showTemporaryMessage(String(currentParamState.currentValue), 1000);
                        if (uniqueParamKey === 'P2_Switches_insert') {
                            ControllerLayer.state.insertMode = currentParamState.currentValue;
                        }
                        if (currentRowKey === 'P1_Timing' && buttonFunction === 'undo' && currentParamState.fullName === 'Reverse') {
                            if (ControllerLayer.state.isReversed !== (currentParamState.currentValue === 'rEV')) {
                                this.toggleReverse();
                            }
                        }
                        longPressTimer = null;
                    }, 500); 
                };
                const clearLongPressTimer = () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                };
                const onMouseUp = () => {
                    if (longPressTimer === null) return;
                    clearLongPressTimer();
                    if (ControllerLayer.state.activeParameter !== currentParamState) {
                        ControllerLayer.state.activeParameter = currentParamState;
                        this.renderLedDisplay(currentParamState.displayName); 
                    } else {
                        if (!currentParamState.isDataWheel) {
                            const currentIndex = currentParamState.options.indexOf(currentParamState.currentValue);
                            const nextIndex = (currentIndex + 1) % currentParamState.options.length;
                            currentParamState.currentValue = currentParamState.options[nextIndex];
                            currentParamState.displayName = String(currentParamState.options[nextIndex]);
                            this.renderLedDisplay(String(currentParamState.currentValue));
                        } else {
                            this.renderLedDisplay(String(currentParamState.currentValue));
                        }
                    }
                    resetButton.removeEventListener('mouseup', onMouseUp);
                    resetButton.removeEventListener('mouseleave', onMouseLeave);
                };
                const onMouseLeave = () => {
                    clearLongPressTimer();
                    onMouseUp(); 
                    resetButton.removeEventListener('mouseup', onMouseUp);
                    resetButton.removeEventListener('mouseleave', onMouseLeave);
                };
                startLongPressTimer();
                resetButton.addEventListener('mouseup', onMouseUp);
                resetButton.addEventListener('mouseleave', onMouseLeave);
            }
            
            setupKnob(knob) {
                if (!knob) return;
                const param = knob.dataset.param;
                const knobImage = knob.querySelector('.knob-image');
                let isDragging = false, startY = 0, startValue;
                const updateVisual = (value) => {
                    const rotation = ((value / 127) * 270) - 135;  
                    if (knobImage) knobImage.style.transform = `rotate(${rotation}deg)`;
                };
                
                if (param === 'feedback' && this.state.parameterMode > 0 && ControllerLayer.state.activeParameter && ControllerLayer.state.activeParameter.isDataWheel) {
                    updateVisual(this.convertDataWheelValueToKnobPosition(ControllerLayer.state.activeParameter));
                } else {
                    updateVisual(this.state.controlValues[param]);
                }
                knob.addEventListener('mousedown', (e) => {
                    if (!this.state.power) return;
                    e.preventDefault();
                    isDragging = true;
                    startY = e.clientY;
                    if (param === 'feedback' && this.state.parameterMode > 0 && ControllerLayer.state.activeParameter && ControllerLayer.state.activeParameter.isDataWheel) {
                        startValue = ControllerLayer.state.activeParameter.currentValue;
                    } else {
                        startValue = this.state.controlValues[param];
                    }
                    this.showTemporaryMessage(Math.round(startValue).toString(), 1000);
                });
                const onMouseMove = (e) => {
                    if (!isDragging) return;
                    const deltaY = startY - e.clientY;
                    const sensitivity = 127 / 200; 
                    let newValue = startValue + deltaY * sensitivity;
                    
                    newValue = Math.max(0, Math.min(127, newValue));
                    if (param === 'feedback' && this.state.parameterMode > 0 && ControllerLayer.state.activeParameter && ControllerLayer.state.activeParameter.isDataWheel) {
                        const activeParam = ControllerLayer.state.activeParameter;
                        const options = activeParam.options;
                        if (options.length > 1 && typeof options[0] === 'number') {
                            const minVal = Math.min(...options);
                            const maxVal = Math.max(...options);
                            const range = maxVal - minVal;
                            
                            let paramValue = Math.round((newValue / 127) * range) + minVal;
                            paramValue = Math.max(minVal, Math.min(maxVal, paramValue));
                            activeParam.currentValue = paramValue;
                            this.showTemporaryMessage(String(paramValue), 600);
                        } else {
                             this.showTemporaryMessage(String(newValue), 600);
                        }
                    } else {
                        this.state.controlValues[param] = newValue;
                        this.showTemporaryMessage(Math.round(newValue).toString(), 600);
                        this.applyKnobToAudio(param, newValue);
                    }
                    updateVisual(newValue);
                };
                const onMouseUp = () => {  
                    isDragging = false;  
                    if (!this.displayTimeout) {
                        if (this.state.parameterMode > 0 && ControllerLayer.state.activeParameter) {
                            this.renderLedDisplay(String(ControllerLayer.state.activeParameter.currentValue));
                        } else {
                            this.renderLedDisplay(this.getDefaultDisplay());
                        }
                    }
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                
                knob.addEventListener('touchstart', (e) => {
                    if (!this.state.power) return;
                    e.preventDefault();
                    isDragging = true;
                    startY = e.touches[0].clientY;
                    if (param === 'feedback' && this.state.parameterMode > 0 && ControllerLayer.state.activeParameter && ControllerLayer.state.activeParameter.isDataWheel) {
                        startValue = ControllerLayer.state.activeParameter.currentValue;
                    } else {
                        startValue = this.state.controlValues[param];
                    }
                    this.showTemporaryMessage(Math.round(startValue).toString(), 1000);
                }, { passive: false });
                const onTouchMove = (e) => {
                    if (!isDragging) return;
                    e.preventDefault();
                    const deltaY = startY - e.touches[0].clientY;
                    const sensitivity = 127 / 200;
                    let newValue = startValue + deltaY * sensitivity;
                    
                    newValue = Math.max(0, Math.min(127, newValue));
                    if (param === 'feedback' && this.state.parameterMode > 0 && ControllerLayer.state.activeParameter && ControllerLayer.state.activeParameter.isDataWheel) {
                        const activeParam = ControllerLayer.state.activeParameter;
                        const options = activeParam.options;
                        if (options.length > 1 && typeof options[0] === 'number') {
                            const minVal = Math.min(...options);
                            const maxVal = Math.max(...options);
                            const range = maxVal - minVal;
                            let paramValue = Math.round((newValue / 127) * range) + minVal;
                            paramValue = Math.max(minVal, Math.min(maxVal, paramValue));
                            activeParam.currentValue = paramValue;
                            this.showTemporaryMessage(String(paramValue), 600);
                        } else {
                            this.showTemporaryMessage(String(newValue), 600);
                        }
                    } else {
                        this.state.controlValues[param] = newValue;
                        this.showTemporaryMessage(Math.round(newValue).toString(), 600);
                        this.applyKnobToAudio(param, newValue);
                    }
                    updateVisual(newValue);
                };
                const onTouchEnd = () => {
                    isDragging = false;
                    if (!this.displayTimeout) {
                        if (this.state.parameterMode > 0 && ControllerLayer.state.activeParameter) {
                            this.renderLedDisplay(String(ControllerLayer.state.activeParameter.currentValue));
                        } else {
                            this.renderLedDisplay(this.getDefaultDisplay());
                        }
                    }
                };
                document.addEventListener('touchmove', onTouchMove, { passive: false });
                document.addEventListener('touchend', onTouchEnd);
            }
            
            convertDataWheelValueToKnobPosition(param) {
                const options = param.options;
                if (options.length > 1 && typeof options[0] === 'number') {
                    const minVal = Math.min(...options);
                    const maxVal = Math.max(...options);
                    const range = maxVal - minVal;
                    if (range === 0) return 0;
                    return ((param.currentValue - minVal) / range) * 127;
                }
                return 0;
            }
            applyKnobToAudio(param, value) {
                const audioCtx = SignalChainLayer.audioContext;
                if (!audioCtx) return;
                const gainValue = value / 127;
                switch (param) {
                    case 'input':
                        if (SignalChainLayer.audioNodes.inputGain) {
                            SignalChainLayer.audioNodes.inputGain.gain.value = gainValue;
                        }
                        break;
                    case 'output':
                        if (SignalChainLayer.audioNodes.outputGain) {
                            SignalChainLayer.audioNodes.outputGain.gain.value = gainValue;
                        }
                        this.applyMuteState();
                        break;
                    case 'mix':
                        if (SignalChainLayer.audioNodes.mixGain) {
                            SignalChainLayer.audioNodes.mixGain.gain.value = gainValue;
                        }
                        break;
                    case 'feedback':
                        this.state.controlValues.feedback = value;
                        if (SignalChainLayer.audioNodes.feedbackGain) {
                            SignalChainLayer.audioNodes.feedbackGain.gain.value = gainValue;
                            
                            // [pleco] feedback level was forwarded to the recorder worklet here; worklet removed.
                            
                            // Immediately update mix when feedback changes during playback
                            if (ControllerLayer.state.loopState === 'playing') {
                                this.updateCurrentMix();
                                const loop = BufferLayer.state.loops[0];
                                if (loop.playbackNode) {
                                    loop.playbackNode.stop();
                                    loop.playbackNode.disconnect();
                                    loop.playbackNode = null;
                                }
                                this.playLoop();
                            }
                        }
                        break;
                }
            }
            
            handleRecordButton() {
                const state = ControllerLayer.state;
                
                // Check for unrounded multiply - pressing Record during multiply operation
                if (state.loopState === 'multiplying') {
                    this.stopMultiplyUnrounded();
                    return;
                }
                
                if (state.loopState === 'idle' || state.loopState === 'playing') {
                    this.startRecording();
                } else if (state.loopState === 'recording') {
                    this.stopRecording();
                }
            }
            startRecording() {
                if (SignalChainLayer.audioContext && SignalChainLayer.audioContext.state === 'suspended') {
                    SignalChainLayer.audioContext.resume().then(() => {
                        this._startRecordingLogic();
                    });
                } else {
                    this._startRecordingLogic();
                }
            }
            _startRecordingLogic() {
                ControllerLayer.state.loopState = 'recording';
                
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.playbackNode) {
                    loop.playbackNode.stop();
                    loop.playbackNode.disconnect();
                    loop.playbackNode = null;
                }
                if (loop.buffer) {
                    const audioCtx = SignalChainLayer.audioContext;
                    const undoBuffer = audioCtx.createBuffer(
                        loop.buffer.numberOfChannels,
                        loop.buffer.length,
                        loop.buffer.sampleRate
                    );
                    for (let channel = 0; channel < loop.buffer.numberOfChannels; channel++) {
                        undoBuffer.copyToChannel(loop.buffer.getChannelData(channel), channel);
                    }
                    loop.undoStack.push(undoBuffer);
                    this.updateLed('undo', 'ready');
                }
                BufferLayer.state.recordedChunks = [];
                
                this.updateLed('record', 'recording');
                this.updateLed('overdub', 'ready');
                this.updateLed('multiply', 'ready');
                this.updateLed('insert', ControllerLayer.state.isReversed ? 'recording' : 'ready');
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
                this.startLoopTimer();
            }
            stopRecording() {
                if (ControllerLayer.state.loopState !== 'recording') return;
                ControllerLayer.state.loopState = 'playing';
                const totalLength = BufferLayer.state.recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                if (totalLength < SignalChainLayer.audioContext.sampleRate * 0.1) {
                    ControllerLayer.state.loopState = 'idle';
                    this.updateLed('record', 'ready');
                    this.stopLoopTimer();
                    this.renderLedDisplay('.');
                    BufferLayer.state.recordedChunks = [];
                    if (BufferLayer.state.loops[0].undoStack.length > 0) {
                        BufferLayer.state.loops[0].undoStack.pop();
                        this.updateLed('undo', BufferLayer.state.loops[0].undoStack.length > 0 ? 'ready' : 'off');
                    }
                    return;
                }
                const audioCtx = SignalChainLayer.audioContext;
                const combined = new Float32Array(totalLength);
                let offset = 0;
                BufferLayer.state.recordedChunks.forEach(chunk => {
                    combined.set(chunk, offset);
                    offset += chunk.length;
                });
                const audioBuffer = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate);
                audioBuffer.copyToChannel(combined, 0);
                
                // Mark the beginning of the loop for cycle detection
                this.markLoopStart(audioBuffer);
                
                const loop = BufferLayer.state.loops[0];
                loop.baseBuffer = audioBuffer; // Store as base loop
                loop.buffer = audioBuffer; // Keep for compatibility
                loop.overdubLayers = []; // Reset overdub layers
                
                this.playLoop();
                
                this.updateLed('record', 'ready');
                this.stopLoopTimer();
            }
            playLoop() {
              const loop = BufferLayer.state.loops[0];
              if (!loop.buffer) return;
              const audioCtx = SignalChainLayer.audioContext;
              if (loop.playbackNode) {
                  loop.playbackNode.stop();
                  loop.playbackNode.disconnect();
                  loop.playbackNode = null;
              }
              
              // Clear any existing feedback decay timer
              if (loop.feedbackDecayTimer) {
                  clearInterval(loop.feedbackDecayTimer);
                  loop.feedbackDecayTimer = null;
              }
              // [pleco] clear any prior loop-clock cycle timer before restart
              if (loop.cycleTimer) {
                  clearInterval(loop.cycleTimer);
                  loop.cycleTimer = null;
              }
              
              const player = audioCtx.createBufferSource();
              player.buffer = loop.buffer;
              player.loop = true;
          
              player.playbackRate.value = 1;
      
              player.connect(SignalChainLayer.audioNodes.feedbackGain); 
              player.connect(SignalChainLayer.audioNodes.mixGain);
          
              player.start(0);
              loop.playbackNode = player;
              
              // [pleco] cycle-start now comes from the engine clock, not a worklet marker:
              // fire handleCycleStart once per loop-duration boundary. The interval
              // self-gates on THIS player still being the active playback node, so a
              // hard-stop (powerOff / reset / record) lets it self-clear with no blink.
              const cycleMs = loop.buffer.duration * 1000;
              if (cycleMs > 0) {
                  const cycleTimer = setInterval(() => {
                      if (BufferLayer.state.loops[0] === loop && loop.playbackNode === player) {
                          this.handleCycleStart();
                      } else {
                          clearInterval(cycleTimer);
                          if (loop.cycleTimer === cycleTimer) loop.cycleTimer = null;
                      }
                  }, cycleMs);
                  loop.cycleTimer = cycleTimer;
              }
              
              // Start continuous feedback decay if feedback < 127
              this.startFeedbackDecay();
          
              this.applyMuteState();
            }
            
            handleCycleStart() {
                // Blink the loop LED unless we're in parameter edit mode
                if (this.state.parameterMode === 0) {
                    this.updateLed('loops-led', 'green');
                    setTimeout(() => {
                        if (this.state.parameterMode === 0) { // Check again in case mode changed
                            this.updateLed('loops-led', 'off');
                        }
                    }, 100); // Quick 100ms blink
                }
            }
            
            startFeedbackDecay() {
                const loop = BufferLayer.state.loops[0];
                if (!loop.baseBuffer) return;
                
                const feedbackValue = this.state.controlValues.feedback;
                if (feedbackValue >= 127) return; // No decay needed at max feedback
                
                const loopDurationMs = loop.baseBuffer.duration * 1000;
                
                // Apply feedback decay to overdub layers each loop cycle
                loop.feedbackDecayTimer = setInterval(() => {
                    if (!loop.baseBuffer || ControllerLayer.state.loopState !== 'playing') {
                        clearInterval(loop.feedbackDecayTimer);
                        loop.feedbackDecayTimer = null;
                        return;
                    }
                    
                    const currentFeedbackGain = this.state.controlValues.feedback / 127;
                    
                    // Apply decay to each overdub layer buffer directly
                    loop.overdubLayers.forEach(layer => {
                        for (let channel = 0; channel < layer.buffer.numberOfChannels; channel++) {
                            const layerData = layer.buffer.getChannelData(channel);
                            for (let i = 0; i < layerData.length; i++) {
                                layerData[i] *= currentFeedbackGain;
                            }
                        }
                    });
                    
                    // Regenerate the mixed buffer with decayed overdubs
                    this.updateCurrentMix();
                    
                    // Restart playback with updated mix
                    if (loop.playbackNode) {
                        loop.playbackNode.stop();
                        loop.playbackNode.disconnect();
                        loop.playbackNode = null;
                    }
                    this.playLoop();
                    
                }, loopDurationMs);
            }
            
            markLoopStart(buffer) {
                if (!buffer) return;
                
                // Add inaudible marker to first few samples
                // Use a tiny, unique pattern that won't occur naturally
                const MARKER_PATTERN = [0.00001, -0.00001, 0.00001]; // Very quiet alternating pattern
                
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const channelData = buffer.getChannelData(channel);
                    for (let i = 0; i < Math.min(MARKER_PATTERN.length, channelData.length); i++) {
                        channelData[i] += MARKER_PATTERN[i];
                    }
                }
            }
            
            updateCurrentMix() {
                const loop = BufferLayer.state.loops[0];
                if (!loop.baseBuffer) return;
                
                const audioCtx = SignalChainLayer.audioContext;
                const currentFeedback = this.state.controlValues.feedback;
                
                // Create new mix buffer
                const newMix = audioCtx.createBuffer(
                    loop.baseBuffer.numberOfChannels,
                    loop.baseBuffer.length,
                    loop.baseBuffer.sampleRate
                );
                
                // Always start with base buffer at 100%
                for (let channel = 0; channel < newMix.numberOfChannels; channel++) {
                    const baseData = loop.baseBuffer.getChannelData(channel);
                    const mixData = newMix.getChannelData(channel);
                    mixData.set(baseData);
                }
                
                // Add all overdub layers with current feedback level
                const currentFeedbackGain = currentFeedback / 127;
                loop.overdubLayers.forEach(layer => {
                    for (let channel = 0; channel < newMix.numberOfChannels; channel++) {
                        const mixData = newMix.getChannelData(channel);
                        const layerData = layer.buffer.getChannelData(channel);
                        for (let i = 0; i < mixData.length; i++) {
                            mixData[i] += layerData[i] * currentFeedbackGain;
                        }
                    }
                });
                
                // Mark the beginning of the loop for cycle detection
                this.markLoopStart(newMix);
                
                loop.currentMix = newMix;
                loop.buffer = newMix; // Keep for compatibility
            }
            
            resetLoop() {
                ControllerLayer.state.loopState = 'idle';
                ControllerLayer.state.isMuted = false;
                ControllerLayer.state.isReversed = false;
                ControllerLayer.state.multiplyCycleCount = 0;
                ControllerLayer.state.multiplyBaseCycleLength = 0;
                ControllerLayer.state.isSusInsert = false;
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.playbackNode) {
                    loop.playbackNode.stop();
                    loop.playbackNode.disconnect();
                    loop.playbackNode = null;
                }
                loop.buffer = null;
                BufferLayer.state.recordedChunks = [];
                BufferLayer.state.overdubChunks = [];
                BufferLayer.state.multiplyChunks = [];
                BufferLayer.state.insertChunks = [];
                loop.undoStack = [];
                this.stopLoopTimer();
                this.renderLedDisplay('.');
                this.updateLed('record', 'ready');
                this.updateLed('overdub', 'ready');
                this.updateLed('multiply', 'ready');
                this.updateLed('insert', 'ready');
                this.updateLed('mute', 'ready');
                this.updateLed('undo', 'off');
                this.updateLed('loops-led', 'off');
                this.updateLed('midi-led', 'off');
                this.updateLed('switches-led', 'off');
                this.updateLed('timing-led', 'off');
            }
            
            handleOverdubButton() {
                const state = ControllerLayer.state;
                if (state.loopState === 'playing') {
                    this.startOverdub();
                } else if (state.loopState === 'overdubbing') {
                    this.stopOverdub();
                } else {
                    this.showTemporaryMessage('NO LP', 1000);
                }
            }
            startOverdub() {
                if (!BufferLayer.state.loops[0].buffer) {
                    this.showTemporaryMessage('NO LP', 1000);
                    return;
                }
                ControllerLayer.state.loopState = 'overdubbing';
                
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.buffer) {
                    const audioCtx = SignalChainLayer.audioContext;
                    const undoBuffer = audioCtx.createBuffer(
                        loop.buffer.numberOfChannels,
                        loop.buffer.length,
                        loop.buffer.sampleRate
                    );
                    for (let channel = 0; channel < loop.buffer.numberOfChannels; channel++) {
                        undoBuffer.copyToChannel(loop.buffer.getChannelData(channel), channel);
                    }
                    loop.undoStack.push(undoBuffer);
                    this.updateLed('undo', 'ready');
                }
                
                BufferLayer.state.overdubChunks = [];
                this.updateLed('overdub', 'recording');
                this.updateLed('record', 'ready');
                this.updateLed('multiply', 'ready');
                this.updateLed('insert', ControllerLayer.state.isReversed ? 'recording' : 'ready');
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
            }
            stopOverdub() {
              if (ControllerLayer.state.loopState !== 'overdubbing') return;
          
              const loop = BufferLayer.state.loops[0];
              if (!loop.baseBuffer) {
                  this.updateLed('overdub', 'ready');
                  return;
              }
          
              const audioCtx = SignalChainLayer.audioContext;
          
              const totalLength = BufferLayer.state.overdubChunks.reduce((sum, chunk) => sum + chunk.length, 0);
              if (totalLength === 0) {
                  // No overdub recorded, just continue playing
                  ControllerLayer.state.loopState = 'playing';
                  this.updateLed('overdub', 'ready');
                  return;
              }
              
              // Create overdub layer buffer
              const combinedOverdub = new Float32Array(totalLength);
              let offset = 0;
              BufferLayer.state.overdubChunks.forEach(chunk => {
                  combinedOverdub.set(chunk, offset);
                  offset += chunk.length;
              });
          
              const overdubBuffer = audioCtx.createBuffer(1, loop.baseBuffer.length, loop.baseBuffer.sampleRate);
              const overdubData = overdubBuffer.getChannelData(0);
              
              // Copy overdub data, cycling if necessary
              for (let i = 0; i < overdubData.length; i++) {
                  overdubData[i] = combinedOverdub[i % combinedOverdub.length] || 0;
              }
              
              // Add to overdub layers (feedback level will be applied dynamically)
              loop.overdubLayers.push({
                  buffer: overdubBuffer,
                  originalLevel: 127 // Store at full level, feedback applied in mix
              });
              
              // Update the mixed buffer for playback
              this.updateCurrentMix();
          
              BufferLayer.state.overdubChunks = [];
          
              if (loop.playbackNode) {
                  loop.playbackNode.stop();
                  loop.playbackNode.disconnect();
                  loop.playbackNode = null;
              }
              this.playLoop();
          
              ControllerLayer.state.loopState = 'playing';
              this.updateLed('overdub', 'ready');
            }
            
            handleMultiplyButton() {
                const state = ControllerLayer.state;
                if (state.loopState === 'playing') {
                    this.startMultiply();
                } else if (state.loopState === 'multiplying') {
                    this.stopMultiply();
                } else {
                    this.showTemporaryMessage('NO LP', 1000);
                }
            }
            startMultiply() {
                if (!BufferLayer.state.loops[0].buffer) {
                    this.showTemporaryMessage('NO LP', 1000);
                    return;
                }
                ControllerLayer.state.loopState = 'multiplying';
                
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.buffer) {
                    const audioCtx = SignalChainLayer.audioContext;
                    const undoBuffer = audioCtx.createBuffer(
                        loop.buffer.numberOfChannels,
                        loop.buffer.length,
                        loop.buffer.sampleRate
                    );
                    for (let channel = 0; channel < loop.buffer.numberOfChannels; channel++) {
                        undoBuffer.copyToChannel(loop.buffer.getChannelData(channel), channel);
                    }
                    loop.undoStack.push(undoBuffer);
                    this.updateLed('undo', 'ready');
                }
                BufferLayer.state.multiplyChunks = [];
                
                // Store the base cycle length for multiply display
                ControllerLayer.state.multiplyBaseCycleLength = loop.buffer.duration;
                ControllerLayer.state.multiplyCycleCount = 1;
                
                this.updateLed('multiply', 'recording');
                this.updateLed('record', 'ready');
                this.updateLed('overdub', 'ready');
                this.updateLed('insert', ControllerLayer.state.isReversed ? 'recording' : 'ready');
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
                
                // Start the multiply display counter
                this.startMultiplyDisplay();
            }
            
            startMultiplyDisplay() {
                // Clear any existing interval
                if (FeedbackLayer.state.multiplyDisplayInterval) {
                    clearInterval(FeedbackLayer.state.multiplyDisplayInterval);
                }
                
                // Start counting up from 0 to base cycle length, then continue counting cycles
                let elapsedTime = 0;
                const baseCycleLength = ControllerLayer.state.multiplyBaseCycleLength;
                const startTime = Date.now();
                
                FeedbackLayer.state.multiplyDisplayInterval = setInterval(() => {
                    elapsedTime = (Date.now() - startTime) / 1000;
                    
                    if (elapsedTime < baseCycleLength) {
                        // Counting up to base cycle length
                        this.renderLedDisplay(this.formatLoopTime(elapsedTime));
                    } else {
                        // Counting cycles beyond base length
                        const cycles = Math.floor(elapsedTime / baseCycleLength);
                        this.renderMultipleDisplay(cycles.toString());
                    }
                }, 50);
            }
            
            stopMultiplyDisplay() {
                if (FeedbackLayer.state.multiplyDisplayInterval) {
                    clearInterval(FeedbackLayer.state.multiplyDisplayInterval);
                    FeedbackLayer.state.multiplyDisplayInterval = null;
                }
            }
            
            _getCycleInfo() {
              const sr   = SignalChainLayer.audioContext?.sampleRate || 44100;
              const loop = BufferLayer.state.loops[0];
              const loopLen = loop?.buffer?.length || 0;
          
              const eighthsPerCycle = this.state.parameters['P1_Timing_multiply']?.currentValue ?? 8;
              const tempoBPM        = this.state.parameters['P4_Loops_nextloop']?.currentValue ?? 120;
              const eighthDurSec    = (60 / tempoBPM) / 2;
              const cycleSec        = eighthsPerCycle * eighthDurSec;
              const cycleSamples    = Math.round(cycleSec * sr);
          
              const roundMode = this.state.parameters['P2_Switches_multiply']?.currentValue ?? 'OFF';
          
              return { sr, loopLen, cycleSamples, cycleSec, roundMode, tempoBPM, eighthsPerCycle };
            }
          
            _quantizeLength(rawLenSamples, originalLoopLen, { cycleSamples, roundMode }) {
              if (roundMode === 'RND' && cycleSamples > 0) {
                const cycles = Math.max(1, Math.round(rawLenSamples / cycleSamples));
                return cycles * cycleSamples;
              }
              const loops = Math.max(1, Math.ceil(rawLenSamples / originalLoopLen));
              return loops * originalLoopLen;
            }
            
            stopMultiply() {
              if (ControllerLayer.state.loopState !== 'multiplying') return;
            
              this.stopMultiplyDisplay();
              
              const loop = BufferLayer.state.loops[0];
              const audioCtx = SignalChainLayer.audioContext;
              const originalLoopLength = loop.buffer ? loop.buffer.length : 0;
            
              const totalNewInputLength = BufferLayer.state.multiplyChunks.reduce((s, ch) => s + ch.length, 0);
              if (totalNewInputLength === 0) {
                ControllerLayer.state.loopState = 'playing';
                this.updateLed('multiply', 'ready');
                if (loop.undoStack.length > 0) {
                    loop.buffer = loop.undoStack.pop();
                    this.updateLed('undo', loop.undoStack.length > 0 ? 'ready' : 'off');
                    this.playLoop();
                }
                return;
              }
            
              // Get cycle info for authentic quantization behavior
              const cycleInfo = this._getCycleInfo();
              const rawLenSamples = originalLoopLength + totalNewInputLength;
              
              // Apply authentic Echoplex quantization based on RoundMode parameter
              const quantizedLenSamples = this._quantizeLength(rawLenSamples, originalLoopLength, cycleInfo);
              
              // Check for memory overflow (authentic hardware behavior)
              const maxMemorySamples = audioCtx.sampleRate * 60; // Assume 60 seconds max memory
              if (quantizedLenSamples > maxMemorySamples) {
                  this.showTemporaryMessage('---', 2000); // Show dashes like hardware
                  ControllerLayer.state.loopState = 'playing';
                  this.updateLed('multiply', 'ready');
                  if (loop.undoStack.length > 0) {
                      loop.buffer = loop.undoStack.pop();
                      this.updateLed('undo', loop.undoStack.length > 0 ? 'ready' : 'off');
                      this.playLoop();
                  }
                  return;
              }
            
              const combinedNewInput = new Float32Array(totalNewInputLength);
              let off = 0;
              BufferLayer.state.multiplyChunks.forEach(ch => { combinedNewInput.set(ch, off); off += ch.length; });
            
              // Create new buffer with quantized length
              const newBuf = audioCtx.createBuffer(1, quantizedLenSamples, audioCtx.sampleRate);
              const newData = newBuf.getChannelData(0);
              const oldData = loop.buffer ? loop.buffer.getChannelData(0) : new Float32Array(0);
            
              // Authentic feedback scaling: ~95% during multiply operation
              const fbGain = (this.state.controlValues.feedback / 127) * 0.95;
              
              // Fill the quantized buffer with authentic multiply behavior
              for (let i = 0; i < quantizedLenSamples; i++) {
                const oldSample = oldData.length > 0 ? oldData[i % originalLoopLength] * fbGain : 0;
                let newSample = 0;
                
                // Add new input during the actual recorded portion
                if (i >= originalLoopLength && (i - originalLoopLength) < totalNewInputLength) {
                    newSample = combinedNewInput[i - originalLoopLength];
                }
                
                newData[i] = oldSample + newSample;
              }
            
              if (loop.playbackNode) {
                loop.playbackNode.stop();
                loop.playbackNode.disconnect();
                loop.playbackNode = null;
              }
            
              loop.buffer = newBuf;
              
              this.playLoop();
            
              this.updateLed('multiply', 'ready');
              ControllerLayer.state.loopState = 'playing';
              
              // Update display with final loop time
              this.renderLedDisplay(this.formatLoopTime(loop.buffer.duration));
              this.renderMultipleDisplay('');
            }
            
            stopMultiplyUnrounded() {
              // Authentic hardware behavior: Record button forces unrounded multiply
              if (ControllerLayer.state.loopState !== 'multiplying') return;
            
              this.stopMultiplyDisplay();
              
              const loop = BufferLayer.state.loops[0];
              const audioCtx = SignalChainLayer.audioContext;
              const originalLoopLength = loop.buffer ? loop.buffer.length : 0;
            
              const totalNewInputLength = BufferLayer.state.multiplyChunks.reduce((s, ch) => s + ch.length, 0);
              if (totalNewInputLength === 0) {
                ControllerLayer.state.loopState = 'playing';
                this.updateLed('multiply', 'ready');
                if (loop.undoStack.length > 0) {
                    loop.buffer = loop.undoStack.pop();
                    this.updateLed('undo', loop.undoStack.length > 0 ? 'ready' : 'off');
                    this.playLoop();
                }
                return;
              }
            
              const combinedNewInput = new Float32Array(totalNewInputLength);
              let off = 0;
              BufferLayer.state.multiplyChunks.forEach(ch => { combinedNewInput.set(ch, off); off += ch.length; });
            
              // Unrounded: use exact length without quantization
              const newLenSamples = originalLoopLength + totalNewInputLength;
              
              const newBuf = audioCtx.createBuffer(1, newLenSamples, audioCtx.sampleRate);
              const newData = newBuf.getChannelData(0);
              const oldData = loop.buffer ? loop.buffer.getChannelData(0) : new Float32Array(0);
            
              // Authentic feedback scaling during multiply
              const fbGain = (this.state.controlValues.feedback / 127) * 0.95;
              
              for (let i = 0; i < newLenSamples; i++) {
                const oldSample = oldData.length > 0 ? oldData[i % originalLoopLength] * fbGain : 0;
                let newSample = 0;
                
                if (i >= originalLoopLength && (i - originalLoopLength) < totalNewInputLength) {
                    newSample = combinedNewInput[i - originalLoopLength];
                }
                
                newData[i] = oldSample + newSample;
              }
            
              if (loop.playbackNode) {
                loop.playbackNode.stop();
                loop.playbackNode.disconnect();
                loop.playbackNode = null;
              }
            
              loop.buffer = newBuf;
              this.playLoop();
            
              this.updateLed('multiply', 'ready');
              ControllerLayer.state.loopState = 'playing';
              
              // Update display - show actual unrounded time
              this.renderLedDisplay(this.formatLoopTime(loop.buffer.duration));
              this.renderMultipleDisplay('');
              
              // Show brief "UnR" message to indicate unrounded multiply
              this.showTemporaryMessage('UnR', 1000);
            }
            
            handleInsertButton() {
                const state = ControllerLayer.state;
                if (!this.state.power) return;
                
                if (this.state.parameterMode > 0) {
                    this.handleParameterButtonPress('insert', event);
                    return;
                }
                
                // Handle different insert modes
                switch (state.insertMode) {
                    case 'InS': // Standard Insert
                        if (state.loopState === 'playing') {
                            this.startInsert();
                        } else if (state.loopState === 'inserting') {
                            this.stopInsert();
                        } else {
                            this.showTemporaryMessage('NO LP', 1000);
                        }
                        break;
                    case 'SUS': // Sustain mode handled by mousedown/mouseup
                        // Already handled in event listeners
                        break;
                    case 'rhr': // Rehearse
                        this.handleRehearse();
                        break;
                    case 'rPL': // Replace
                        this.handleReplace();
                        break;
                    case 'Sub': // Substitute
                        this.handleSubstitute();
                        break;
                    case 'rEV': // Reverse
                        this.toggleReverse();
                        break;
                    case 'h.SP': // HalfSpeed
                        this.toggleHalfSpeed();
                        break;
                    default:
                        this.showTemporaryMessage('INS', 1000);
                        this.updateLed('insert', 'on');
                        setTimeout(() => this.updateLed('insert', 'ready'), 500);
                }
            }
            
            startInsert() {
                if (!BufferLayer.state.loops[0].buffer) {
                    this.showTemporaryMessage('NO LP', 1000);
                    return;
                }
                
                ControllerLayer.state.loopState = 'inserting';
                
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.buffer) {
                    const audioCtx = SignalChainLayer.audioContext;
                    const undoBuffer = audioCtx.createBuffer(
                        loop.buffer.numberOfChannels,
                        loop.buffer.length,
                        loop.buffer.sampleRate
                    );
                    for (let channel = 0; channel < loop.buffer.numberOfChannels; channel++) {
                        undoBuffer.copyToChannel(loop.buffer.getChannelData(channel), channel);
                    }
                    loop.undoStack.push(undoBuffer);
                    this.updateLed('undo', 'ready');
                }
                
                BufferLayer.state.insertChunks = [];
                
                ControllerLayer.state.insertStartTime = Date.now();
                this.updateLed('insert', 'recording');
                this.updateLed('record', 'ready');
                this.updateLed('overdub', 'ready');
                this.updateLed('multiply', 'ready');
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
                
                // Start insert display counter
                this.startInsertDisplay();
            }
            
            startInsertDisplay() {
                // Clear any existing interval
                if (FeedbackLayer.state.insertDisplayInterval) {
                    clearInterval(FeedbackLayer.state.insertDisplayInterval);
                }
                
                const startTime = ControllerLayer.state.insertStartTime;
                
                FeedbackLayer.state.insertDisplayInterval = setInterval(() => {
                    const elapsedTime = (Date.now() - startTime) / 1000;
                    this.renderLedDisplay(this.formatLoopTime(elapsedTime));
                }, 50);
            }
            
            stopInsertDisplay() {
                if (FeedbackLayer.state.insertDisplayInterval) {
                    clearInterval(FeedbackLayer.state.insertDisplayInterval);
                    FeedbackLayer.state.insertDisplayInterval = null;
                }
            }
            
            stopInsert() {
                if (ControllerLayer.state.loopState !== 'inserting') return;
                
                this.stopInsertDisplay();
                
                const loop = BufferLayer.state.loops[0];
                const audioCtx = SignalChainLayer.audioContext;
                const originalLoopLength = loop.buffer ? loop.buffer.length : 0;
                
                const totalNewInputLength = BufferLayer.state.insertChunks.reduce((s, ch) => s + ch.length, 0);
                if (totalNewInputLength === 0) {
                    ControllerLayer.state.loopState = 'playing';
                    this.updateLed('insert', 'ready');
                    if (loop.undoStack.length > 0) {
                        loop.buffer = loop.undoStack.pop();
                        this.updateLed('undo', loop.undoStack.length > 0 ? 'ready' : 'off');
                        this.playLoop();
                    }
                    return;
                }
                
                const combinedNewInput = new Float32Array(totalNewInputLength);
                let off = 0;
                BufferLayer.state.insertChunks.forEach(ch => { combinedNewInput.set(ch, off); off += ch.length; });
                
                // Create new buffer with inserted content
                const newLenSamples = originalLoopLength + totalNewInputLength;
                const newBuf = audioCtx.createBuffer(1, newLenSamples, audioCtx.sampleRate);
                const newData = newBuf.getChannelData(0);
                const oldData = loop.buffer ? loop.buffer.getChannelData(0) : new Float32Array(0);
                
                // Copy original data
                for (let i = 0; i < originalLoopLength; i++) {
                    newData[i] = oldData[i];
                }
                
                // Add new data at the end
                for (let i = 0; i < totalNewInputLength; i++) {
                    newData[originalLoopLength + i] = combinedNewInput[i];
                }
                
                if (loop.playbackNode) {
                    loop.playbackNode.stop();
                    loop.playbackNode.disconnect();
                    loop.playbackNode = null;
                }
                
                loop.buffer = newBuf;
                this.playLoop();
                
                this.updateLed('insert', 'ready');
                ControllerLayer.state.loopState = 'playing';
                
                // Update display with final loop time
                this.renderLedDisplay(this.formatLoopTime(loop.buffer.duration));
                this.renderMultipleDisplay('');
            }
            
            handleRehearse() {
                this.showTemporaryMessage('rhr', 1000);
                this.updateLed('insert', 'on');
                setTimeout(() => this.updateLed('insert', 'ready'), 500);
            }
            
            handleReplace() {
                const state = ControllerLayer.state;
                if (!BufferLayer.state.loops[0].buffer) {
                    this.showTemporaryMessage('NO LP', 1000);
                    return;
                }
                
                if (state.loopState === 'playing') {
                    this.startReplace();
                } else if (state.loopState === 'replacing') {
                    this.stopReplace();
                } else {
                    this.showTemporaryMessage('NO LP', 1000);
                }
            }
            
            startReplace() {
                if (!BufferLayer.state.loops[0].buffer) {
                    this.showTemporaryMessage('NO LP', 1000);
                    return;
                }
                
                ControllerLayer.state.loopState = 'replacing';
                
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.buffer) {
                    const audioCtx = SignalChainLayer.audioContext;
                    const undoBuffer = audioCtx.createBuffer(
                        loop.buffer.numberOfChannels,
                        loop.buffer.length,
                        loop.buffer.sampleRate
                    );
                    for (let channel = 0; channel < loop.buffer.numberOfChannels; channel++) {
                        undoBuffer.copyToChannel(loop.buffer.getChannelData(channel), channel);
                    }
                    loop.undoStack.push(undoBuffer);
                    
                    loop.replaceStartSample = loop.playbackPosition;
                    loop.replaceInputSamples = [];
                }
                
                this.showTemporaryMessage('rPL', 1000);
                this.updateLed('insert', 'on');
                
                // [pleco] replace capture runs through the mic-feed onChunk tap (loopState 'replacing').
            }
            
            stopReplace() {
                if (ControllerLayer.state.loopState !== 'replacing') return;
                
                const loop = BufferLayer.state.loops[0];
                if (!loop || !loop.buffer) return;
                
                const audioCtx = SignalChainLayer.audioContext;
                const replacedSamples = loop.replaceInputSamples.length;
                
                if (replacedSamples > 0) {
                    // Replace the audio data directly instead of mixing like overdub
                    const bufferData = loop.buffer.getChannelData(0);
                    const startPos = loop.replaceStartSample;
                    
                    for (let i = 0; i < replacedSamples && (startPos + i) < bufferData.length; i++) {
                        const bufferIndex = (startPos + i) % bufferData.length;
                        bufferData[bufferIndex] = loop.replaceInputSamples[i]; // Replace, don't mix
                    }
                    
                    if (loop.buffer.numberOfChannels > 1) {
                        const rightData = loop.buffer.getChannelData(1);
                        for (let i = 0; i < replacedSamples && (startPos + i) < rightData.length; i++) {
                            const bufferIndex = (startPos + i) % rightData.length;
                            rightData[bufferIndex] = loop.replaceInputSamples[i]; // Replace, don't mix
                        }
                    }
                }
                
                loop.replaceInputSamples = null;
                loop.replaceStartSample = null;
                
                ControllerLayer.state.loopState = 'playing';
                this.updateLed('insert', 'ready');
                
                // [pleco] replace-stop no longer signals a worklet; the tap idles on state change.
            }
            
            handleSubstitute() {
                this.showTemporaryMessage('Sub', 1000);
                this.updateLed('insert', 'on');
                setTimeout(() => this.updateLed('insert', 'ready'), 500);
            }
      
            toggleHalfSpeed() {
              const loop = BufferLayer.state.loops[0];
              if (!loop?.buffer) {
                this.showTemporaryMessage('NO LP', 1000);
                return;
              }
              ControllerLayer.state.isHalfSpeed = !ControllerLayer.state.isHalfSpeed;
              const msg = ControllerLayer.state.isHalfSpeed ? '1/2' : 'FUL';
              this.showTemporaryMessage(msg, 800);
          
              if (loop.playbackNode) {
                const dirSign = ControllerLayer.state.isReversed ? -1 : 1;
                const spd     = ControllerLayer.state.isHalfSpeed ? 0.5 : 1.0;
                loop.playbackNode.playbackRate.value = dirSign * spd;
              } else {
                  this.playLoop();
              }
            }
      
            toggleReverse() {
              if (!BufferLayer.state.loops[0].buffer) {
                  this.showTemporaryMessage('NO LP', 1000);
                  return;
              }
      
              ControllerLayer.state.isReversed = !ControllerLayer.state.isReversed;
              this.showTemporaryMessage(ControllerLayer.state.isReversed ? 'rEV' : 'Fd', 1000);
              this.updateLed('insert', ControllerLayer.state.isReversed ? 'recording' : 'ready');
      
              const loop = BufferLayer.state.loops[0];
              const audioCtx = SignalChainLayer.audioContext;
      
              if (loop.playbackNode) {
                  loop.playbackNode.stop();
                  loop.playbackNode.disconnect();
              }
      
              const originalBuffer = loop.buffer;
              const newBuffer = audioCtx.createBuffer(
                  originalBuffer.numberOfChannels,
                  originalBuffer.length,
                  originalBuffer.sampleRate
              );
      
              for (let i = 0; i < originalBuffer.numberOfChannels; i++) {
                  const channelData = originalBuffer.getChannelData(i);
                  Array.prototype.reverse.call(channelData);
                  newBuffer.copyToChannel(channelData, i);
              }
      
              loop.buffer = newBuffer;
              this.playLoop();
            }
            
            handleMuteButton() {
                if (!this.state.power) return;
                
                ControllerLayer.state.isMuted = !ControllerLayer.state.isMuted;
                this.applyMuteState();
                this.showTemporaryMessage(ControllerLayer.state.isMuted ? 'MUTE' : 'PLAY', 1000);
                this.updateLed('mute', ControllerLayer.state.isMuted ? 'recording' : 'ready');
            }
            applyMuteState() {
                if (SignalChainLayer.audioNodes.outputGain) {
                    SignalChainLayer.audioNodes.outputGain.gain.value = ControllerLayer.state.isMuted ? 0 : (this.state.controlValues.output / 127);
                }
            }
            
            handleUndoButton() {
                if (!this.state.power) return;
                const loop = BufferLayer.state.loops[0];
                if (loop.undoStack.length > 0) {
                    loop.buffer = loop.undoStack.pop();
                    this.playLoop();
                    this.showTemporaryMessage('UNDO', 1000);
                    this.updateLed('undo', loop.undoStack.length > 0 ? 'ready' : 'off');
                } else {
                    this.showTemporaryMessage('NO UD', 1000);
                    this.updateLed('undo', 'off');
                }
            }
            
            updateLed(elementIdOrFunctionName, state) {
                let element;
                const functionLed = document.querySelector(`[data-function="${elementIdOrFunctionName}"] .status-led`);
                if (functionLed) {
                    element = functionLed;
                } else {
                    element = document.getElementById(elementIdOrFunctionName);
                }
                if (element) {
                    element.setAttribute('data-hw-state', state);
                    if (element.classList.contains('level-light')) {
                        element.classList.remove('green', 'yellow', 'red', 'off');
                        if (state === 'green') element.classList.add('green');
                        else if (state === 'yellow') element.classList.add('yellow');
                        else if (state === 'red') element.classList.add('red');
                        else element.classList.add('off');
                    }
                }
            }
            
            formatLoopTime(duration) {
                if (duration < 10) return duration.toFixed(2);
                if (duration < 100) return duration.toFixed(1);
                return Math.floor(duration).toString();
            }
            renderLedDisplay(str) {
                if (!this.elements.digitEls) return;
                this.elements.digitEls.forEach(d => {
                    d.querySelectorAll('.segment').forEach(s => s.classList.remove('on'));
                    d.querySelector('.dot').classList.remove('on');
                });
                let displayStr = String(str);
                let pos = this.elements.digitEls.length - 1;
                for (let i = displayStr.length - 1; i >= 0 && pos >= 0; i--) {
                    const ch = displayStr[i].toUpperCase();
                    if (ch === '.') {
                        if (pos < this.elements.digitEls.length - 1) {
                            this.elements.digitEls[pos + 1].querySelector('.dot').classList.add('on');
                        }
                    } else {
                        const segs = SEGMENT_MAP[ch];
                        if (segs) {
                            segs.forEach(segCls => {
                                this.elements.digitEls[pos].querySelector('.' + segCls).classList.add('on');
                            });
                        }
                        pos--;
                    }
                }
            }
            
            renderLeftDisplay(str) {
                if (!this.elements.leftDisplayDigits) return;
                this.elements.leftDisplayDigits.forEach(d => {
                    d.querySelectorAll('.segment').forEach(s => s.classList.remove('on'));
                });
                let displayChar = String(str);
                if (displayChar.length > 1) {
                    displayChar = displayChar[0];
                }
                
                const digitEl = this.elements.leftDisplayDigits[0];
                if (digitEl) {
                    const segs = SEGMENT_MAP[displayChar.toUpperCase()];
                    if (segs) {
                        segs.forEach(segCls => {
                            digitEl.querySelector('.' + segCls).classList.add('on');
                        });
                    }
                }
            }
            
            renderMultipleDisplay(str) {
                if (!this.elements.multipleDisplayDigits) return;
                this.elements.multipleDisplayDigits.forEach(d => {
                    d.querySelectorAll('.segment').forEach(s => s.classList.remove('on'));
                    d.querySelector('.dot').classList.remove('on');
                });
                let displayStr = String(str);
                
                if (displayStr.startsWith('P ') && displayStr.length === 3) {
                    const pChar = 'P';
                    const numChar = displayStr[2];
                    
                    const pSegs = SEGMENT_MAP[pChar];
                    if (pSegs && this.elements.multipleDisplayDigits[0]) {
                        pSegs.forEach(segCls => {
                            this.elements.multipleDisplayDigits[0].querySelector('.' + segCls).classList.add('on');
                        });
                    }
                    
                    const numSegs = SEGMENT_MAP[numChar];
                    if (numSegs && this.elements.multipleDisplayDigits[1]) {
                        numSegs.forEach(segCls => {
                            this.elements.multipleDisplayDigits[1].querySelector('.' + segCls).classList.add('on');
                        });
                    }
                } else {
                    let pos = this.elements.multipleDisplayDigits.length - 1;
                    for (let i = displayStr.length - 1; i >= 0 && pos >= 0; i--) {
                        const ch = displayStr[i].toUpperCase();
                        if (ch === '.') {
                            if (pos < this.elements.multipleDisplayDigits.length - 1) {
                               this.elements.multipleDisplayDigits[pos + 1].querySelector('.dot').classList.add('on');
                            }
                        } else {
                            const segs = SEGMENT_MAP[ch];
                            if (segs) {
                                segs.forEach(segCls => {
                                    this.elements.multipleDisplayDigits[pos].querySelector('.' + segCls).classList.add('on');
                                });
                            }
                            pos--;
                        }
                    }
                }
            }
            startLoopTimer() {
                FeedbackLayer.state.timerStartTime = Date.now();
                this.renderLedDisplay(this.formatLoopTime(0));
                this.renderLeftDisplay(1);
                this.renderMultipleDisplay('');
                FeedbackLayer.state.timerInterval = setInterval(() => {
                    const elapsed = (Date.now() - FeedbackLayer.state.timerStartTime) / 1000;
                    
                    if (elapsed >= this.MAX_LOOP_SECONDS) {
                        this.stopRecording();
                        return;
                    }
                    this.renderLedDisplay(this.formatLoopTime(elapsed));
                }, 50);
            }
            
            stopLoopTimer() {
                clearInterval(FeedbackLayer.state.timerInterval);
                FeedbackLayer.state.timerInterval = null;
                const loop = BufferLayer.state.loops[0];
                if (loop && loop.buffer) {
                    this.renderLedDisplay(this.formatLoopTime(loop.buffer.duration));
                    this.renderLeftDisplay(1);
                    this.renderMultipleDisplay('');
                }
            }
            showTemporaryMessage(message, duration = 2000, callback = null) {
                if (this.displayTimeout) clearTimeout(this.displayTimeout);
                
                let displayableMessage = '';
                for (let i = 0; i < message.length && displayableMessage.length < 3; i++) {
                    const char = message[i].toUpperCase();
                    if (SEGMENT_MAP[char]) {
                        displayableMessage += char;
                    } else if (char === ' ') {
                        displayableMessage += ' ';
                    }
                }
                this.renderLedDisplay(displayableMessage);
                this.displayTimeout = setTimeout(() => {
                    this.displayTimeout = null;
                    if (callback) {
                        callback();
                    } else {
                        if (this.state.parameterMode > 0 && ControllerLayer.state.activeParameter) {
                            this.renderLedDisplay(String(ControllerLayer.state.activeParameter.currentValue));
                        } else if (this.state.parameterMode > 0) {
                            const rowKeys = ['P1_Timing', 'P2_Switches', 'P3_MIDI', 'P4_Loops'];
                            const currentRowData = PARAMETER_MATRIX_DATA[rowKeys[this.state.parameterMode - 1]];
                            this.renderLedDisplay(currentRowData ? currentRowData.displayName : '');
                        } else {
                            this.renderLedDisplay(this.getDefaultDisplay());
                        }
                    }
                }, duration);
            }
            getDefaultDisplay() {
                const loop = BufferLayer.state.loops[0];
                return (loop && loop.buffer) ? this.formatLoopTime(loop.buffer.duration) : '.';
            }
            updateMultipleDisplay(text) {
                this.renderMultipleDisplay(text);
            }
            
            startLevelMonitoring() {
                if (this.animationFrameId) return;
                const audioCtx = SignalChainLayer.audioContext;
                const inputAnalyser = SignalChainLayer.audioNodes.inputAnalyser;
                const feedbackAnalyser = SignalChainLayer.audioNodes.feedbackAnalyser;
                if (!audioCtx || !inputAnalyser || !feedbackAnalyser) {
                    return;
                }
                const inputData = new Uint8Array(inputAnalyser.frequencyBinCount);
                const feedbackData = new Uint8Array(feedbackAnalyser.frequencyBinCount);
                const getAverageVolume = (dataArray) => {
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i];
                    }
                    return sum / dataArray.length;
                };
                const animateLevels = () => {
                    inputAnalyser.getByteFrequencyData(inputData);
                    feedbackAnalyser.getByteFrequencyData(feedbackData);
                    const inputVolume = getAverageVolume(inputData);
                    const feedbackVolume = getAverageVolume(feedbackData);
                    
                    if (ControllerLayer.state.loopState === 'recording' || 
                        ControllerLayer.state.loopState === 'overdubbing' ||
                        ControllerLayer.state.loopState === 'multiplying' ||
                        ControllerLayer.state.loopState === 'inserting' ||
                        ControllerLayer.state.loopState === 'replacing') {
                        if (inputVolume > 200) {
                            this.updateLed('input-level', 'red');
                        } else if (inputVolume > 100) {
                            this.updateLed('input-level', 'yellow');
                        } else if (inputVolume > 10) {
                            this.updateLed('input-level', 'green');
                        } else {
                            this.updateLed('input-level', 'off');
                        }
                    } else {
                        this.updateLed('input-level', 'off');
                    }
                    
                    if (ControllerLayer.state.loopState === 'playing' || 
                        ControllerLayer.state.loopState === 'overdubbing' ||
                        ControllerLayer.state.loopState === 'multiplying' ||
                        ControllerLayer.state.loopState === 'inserting' ||
                        ControllerLayer.state.loopState === 'replacing') {
                        if (feedbackVolume > 200) {
                            this.updateLed('feedback-level', 'red');
                        } else if (feedbackVolume > 100) {
                            this.updateLed('feedback-level', 'yellow');
                        } else if (feedbackVolume > 10) {
                            this.updateLed('feedback-level', 'green');
                        } else {
                            this.updateLed('feedback-level', 'off');
                        }
                    } else {
                        this.updateLed('feedback-level', 'off');
                    }
                    this.animationFrameId = requestAnimationFrame(animateLevels);
                };
                this.animationFrameId = requestAnimationFrame(animateLevels);
            }
            stopLevelMonitoring() {
                if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                }
                
                this.updateLed('input-level', 'off');
                this.updateLed('feedback-level', 'off');
            }
                
        }
        // ============================================================================
        // INITIALIZATION
        // ============================================================================
        let echoplexMinimal;
        // Initialize when the DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                echoplexMinimal = new EchoplexMinimal();
                echoplexMinimal.init();
                window.echoplexMinimal = echoplexMinimal; // Expose for debugging
            });
        } else {
            echoplexMinimal = new EchoplexMinimal();
            echoplexMinimal.init();
            window.echoplexMinimal = echoplexMinimal; // Expose for debugging
        }