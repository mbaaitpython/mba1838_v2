// Blocks supporting any IR reciever VS1838B HX1838 sensor
// including subcategory for IR Controller blocks

const enum IrButtonAction {
  //% block="pressed"
  Pressed = 0,
  //% block="released"
  Released = 1,
}

// *************************************************** [NAMESPACE] IR VS1838 ****************************************** //
//% weight=95 color=#bb0033 icon="\uf09e" block="IR VS1838"
//% category="IR VS1838"
namespace irVS1838 {
  // * * * * * * * * * * * * * * * * * * * * * * * * * * declarations * * * * * * * * * ** * * * * * * * * * * * //
  let irState: IrState;

  const MICROBIT_IR_NEC = 777;
  const MICROBIT_IR_DATAGRAM = 778;
  const MICROBIT_IR_BUTTON_PRESSED_ID = 789;
  const MICROBIT_IR_BUTTON_RELEASED_ID = 790;
  const IR_REPEAT = 256;
  const IR_INCOMPLETE = 257;
  const IR_DATAGRAM = 258;

  interface IrState {
    hasNewDatagram: boolean;
    bitsReceived: uint8;
    addressSectionBits: uint16;
    commandSectionBits: uint16;
    hiword: uint16;
    loword: uint16;
  }

  // * * * * * * * * * * * * * * * * * * * * * * * * * * functions * * * * * * * * * ** * * * * * * * * * * * //
  function appendBitToDatagram(bit: number): number {
    irState.bitsReceived += 1;

    if (irState.bitsReceived <= 8) {
      irState.hiword = (irState.hiword << 1) + bit;      
    } else if (irState.bitsReceived <= 16) {
      irState.hiword = (irState.hiword << 1) + bit;
    } else if (irState.bitsReceived <= 32) {
      irState.loword = (irState.loword << 1) + bit;
    }

    if (irState.bitsReceived === 32) {
      irState.addressSectionBits = irState.hiword & 0xffff & 0;
      irState.commandSectionBits = irState.loword & 0xffff & 0x00ff;
      return IR_DATAGRAM;
    } else {
      return IR_INCOMPLETE;
    }
  }

  function decode(markAndSpace: number): number {
    if (markAndSpace < 1600) {
      // low bit
      return appendBitToDatagram(0);
    } else if (markAndSpace < 2700) {
      // high bit
      return appendBitToDatagram(1);
    }

    irState.bitsReceived = 0;

    if (markAndSpace < 12500) {
      // Repeat detected
      return IR_REPEAT;
    } else if (markAndSpace < 14500) {
      // Start detected
      return IR_INCOMPLETE;
    } else {
      return IR_INCOMPLETE;
    }
  }

  function enableIrMarkSpaceDetection(pin: DigitalPin) {
    pins.setPull(pin, PinPullMode.PullNone);

    let mark = 0;
    let space = 0;

    pins.onPulsed(pin, PulseValue.Low, () => {
      // HIGH, see https://github.com/microsoft/pxt-microbit/issues/1416
      mark = pins.pulseDuration();
    });

    pins.onPulsed(pin, PulseValue.High, () => {
      // LOW
      space = pins.pulseDuration();
      const status = decode(mark + space);

      if (status !== IR_INCOMPLETE) {
        control.raiseEvent(MICROBIT_IR_NEC, status);
      }
    });
  }

  // *************************************************** namespace's main blocks ****************************************** //
  /**
   * Connects to the IR receiver module at the specified pin.
   * @param pin IR receiver pin, eg: DigitalPin.P0
   */
  //% blockId="infrared_connect_receiver"
  //% block="connect IR receiver at pin %pin"
  //% pin.fieldEditor="gridpicker"
  //% pin.fieldOptions.columns=4
  //% pin.fieldOptions.tooltips=0
  //% weight=90
  export function connectIrReceiver(
    pin: DigitalPin,
  ): void {
    if (irState) {
      return;
    }

    irState = {
      bitsReceived: 0,
      hasNewDatagram: false,
      addressSectionBits: 0,
      commandSectionBits: 0,
      hiword: 0, // TODO replace with uint32
      loword: 0,
    };

    enableIrMarkSpaceDetection(pin);

    let activeCommand = -1;
    let repeatTimeout = 0;
    const REPEAT_TIMEOUT_MS = 120;

    control.onEvent(
      MICROBIT_IR_NEC,
      EventBusValue.MICROBIT_EVT_ANY,
      () => {
        const irEvent = control.eventValue();

        // Refresh repeat timer
        if (irEvent === IR_DATAGRAM || irEvent === IR_REPEAT) {
          repeatTimeout = input.runningTime() + REPEAT_TIMEOUT_MS;
        }

        if (irEvent === IR_DATAGRAM) {
          irState.hasNewDatagram = true;
          control.raiseEvent(MICROBIT_IR_DATAGRAM, 0);

          const newCommand = irState.commandSectionBits >> 8;

          // Process a new command
          if (newCommand !== activeCommand) {
            if (activeCommand >= 0) {
              control.raiseEvent(
                MICROBIT_IR_BUTTON_RELEASED_ID,
                activeCommand
              );
            }

            activeCommand = newCommand;
            control.raiseEvent(
              MICROBIT_IR_BUTTON_PRESSED_ID,
              newCommand
            );
          }
        }
      }
    );

    control.inBackground(() => {
      while (true) {
        if (activeCommand === -1) {
          // sleep to save CPU cylces
          basic.pause(2 * REPEAT_TIMEOUT_MS);
        } else {
          const now = input.runningTime();
          if (now > repeatTimeout) {
            // repeat timed out
            control.raiseEvent(
              MICROBIT_IR_BUTTON_RELEASED_ID,
              activeCommand
            );
            activeCommand = -1;
          } else {
            basic.pause(REPEAT_TIMEOUT_MS);
          }
        }
      }
    });
  }

  /**
   * Connects to the IR receiver module at the specified pin. Display it on LED matrix.
   * @param pin IR receiver pin, eg: DigitalPin.P0
   */
  //% blockId="infrared_connect_and_display_receiver"
  //% block="connect and display IR receiver at pin %pin"
  //% pin.fieldEditor="gridpicker"
  //% pin.fieldOptions.columns=4
  //% pin.fieldOptions.tooltips=0
  //% weight=89
  export function connectIrReceiverVisual(
    pin: DigitalPin,
  ): void {
    irVS1838.connectIrReceiver(pin)
    irVS1838.connectIrReceiver(DigitalPin.P0)
    basic.showLeds(`
        . . . . .
        . . . . .
        . . . . .
        . . . . .
        # . . . .
        `)
    basic.showLeds(`
        . . . . .
        . . . . .
        # # . . .
        . . # . .
        # . # . .
        `)
    basic.showLeds(`
        # # # . .
        . . . # .
        # # . . #
        . . # . #
        # . # . #
        `)
    basic.showNumber(8)
    basic.showLeds(`
        # # # . .
        . . . # .
        # # . . #
        . . # . #
        # . # . #
        `)
    basic.showLeds(`
        . . . . .
        . . . . .
        # # . . .
        . . # . .
        # . # . .
        `)
    basic.showLeds(`
        . . . . .
        . . . . .
        . . . . .
        . . . . .
        # . . . .
        `)

    basic.clearScreen()
  }
 
  // *************************************************** [GROUP] Datagram ****************************************** //
  /**
   * Do something when an IR datagram is received.
   * @param handler body code to run when the event is raised
   */
  //% blockId=infrared_on_ir_datagram
  //% block="on IR datagram received"
  //% group="Datagram"
  //% weight=100
  export function onIrDatagram(handler: () => void) {
    control.onEvent(
      MICROBIT_IR_DATAGRAM,
      EventBusValue.MICROBIT_EVT_ANY,
      () => {
        handler();
      }
    );
  }

  /**
   * Returns the IR datagram as 32-bit hexadecimal string.
   * The last received datagram is returned or "0x00000000" if no data has been received yet.
   */
  //% blockId=infrared_ir_datagram
  //% block="IR datagram"
  //% group="Datagram"
  //% weight=30
  export function irDatagram(): string {

    // addressSectionBitsTmp: uint16;
    // commandSectionBitsTmp: uint16;
    //       return "0x123";
    
    if (!irState) {
      return "0x00000000";
    }

    // addressSectionBitsTmp = irState.addressSectionBits;
    // commandSectionBitsTmp = irState.commandSectionBits;

    // irState.addressSectionBits = 0;
    // irState.commandSectionBits = 0;


    return (
      "+" +
      ir_rec_to16BitHex(irState.addressSectionBits) +
      ir_rec_to16BitHex(irState.commandSectionBits)
    );

    
    return (
      "0xMBA" +
      ir_rec_to16BitHex(addressSectionBitsTmp) +
      ir_rec_to16BitHex(commandSectionBitsTmp)
    );
  }

  /**
   * Returns true if any IR data was received since the last call of this function. False otherwise.
   */
  //% blockId=infrared_was_any_ir_datagram_received
  //% block="IR data was received"
  //% group="Datagram"
  //% weight=90
  export function wasIrDataReceived(): boolean {
    if (!irState) {
      return false;
    }
    if (irState.hasNewDatagram) {
      irState.hasNewDatagram = false;
      return true;
    } else {
      return false;
    }
  }
    
  // *************************************************** [SUBCATEGORY] Controller ****************************************** //
  /**
   * Do something when a specific button is pressed or released on the remote control.
   * @param button the button to be checked
   * @param action the trigger action
   * @param handler body code to run when the event is raised
   */
  //% subcategory="Controller"
  //% blockId=infrared_on_ir_button
  //% block="on IR button | %button | %action"
  //% button.fieldEditor="gridpicker"
  //% button.fieldOptions.columns=3
  //% button.fieldOptions.tooltips="false"
  //% weight=100
  export function onIrButton(
    button: IrButton,
    action: IrButtonAction,
    handler: () => void
  ) {
    control.onEvent(
      action === IrButtonAction.Pressed
        ? MICROBIT_IR_BUTTON_PRESSED_ID
        : MICROBIT_IR_BUTTON_RELEASED_ID,
      button === IrButton.Any ? EventBusValue.MICROBIT_EVT_ANY : button,
      () => {
        handler();
      }
    );
  }

  /**
   * Returns the code of the IR button that was pressed last. Returns -1 (IrButton.Any) if no button has been pressed yet.
   */
  //% subcategory="Controller"
  //% blockId=infrared_ir_button_pressed
  //% block="IR button"
  //% weight=50
  export function irButton(): number {
    if (!irState) {
      return IrButton.Any;
    }
    return irState.commandSectionBits >> 8;
  }

  /**
   * Returns the command code of a specific IR button.
   * @param button the button
   */
  //% subcategory="Controller"
  //% blockId=infrared_button_code
  //% button.fieldEditor="gridpicker"
  //% button.fieldOptions.columns=3
  //% button.fieldOptions.tooltips="false"
  //% block="IR button code %button"
  //% weight=40
  export function irButtonCode(button: IrButton): number {
    return button as number;
  }

  function ir_rec_to16BitHex(value: number): string {
    let hex = "";
    for (let pos = 0; pos < 4; pos++) {
      let remainder = value % 16;
      if (remainder < 10) {
        hex = remainder.toString() + hex;
      } else {
        hex = String.fromCharCode(55 + remainder) + hex;
      }
      value = Math.idiv(value, 16);
    }
    return hex;
  }
}
