// Initialize canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameArea = document.getElementById('gameArea');

// Screen dimensions
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
if (gameArea) {
    gameArea.style.width = SCREEN_WIDTH + 'px';
    gameArea.style.height = SCREEN_HEIGHT + 'px';
}

// Brick properties
const BRICK_WIDTH = 60;
const BRICK_HEIGHT = 20;
const BRICK_ROWS = 5;
const BRICK_COLS = 10;
const BRICK_PADDING = 10;
const BRICK_OFFSET_TOP = 35;
const BRICK_OFFSET_LEFT = 35;

// Colors
const COLOR_BLACK = 'black';
const COLOR_WHITE = 'white';
const COLOR_RED = 'red';
const COLOR_BLUE = 'blue';

// Default speeds
const DEFAULT_BALL_SPEED = 7.0;
const MAX_BALL_SPEED = 50.0;
const DEFAULT_PADDLE_SPEED = 9;
const PADDLE_SPEED_RATIO = DEFAULT_PADDLE_SPEED / DEFAULT_BALL_SPEED;

// Paddle setup
let paddle = {
    width: 100,
    height: 10,
    x: SCREEN_WIDTH / 2 - 50,
    y: SCREEN_HEIGHT - 50,
    speed: DEFAULT_PADDLE_SPEED
};

// Ball setup
let ball = {
    radius: 10,
    x: SCREEN_WIDTH / 2,
    y: SCREEN_HEIGHT / 2,
    dx: DEFAULT_BALL_SPEED * (Math.random() < 0.5 ? 1 : -1),
    dy: DEFAULT_BALL_SPEED * (Math.random() < 0.5 ? 1 : -1),
    speed: DEFAULT_BALL_SPEED
};
const initialAngleForBall = Math.atan2(ball.dy, ball.dx);
ball.dx = ball.speed * Math.cos(initialAngleForBall);
ball.dy = ball.speed * Math.sin(initialAngleForBall);

// Bricks array
let bricks = [];

// Game state variables
let score = 0;
let autoFollowMode = true;
let running = true;
let animationFrameId;
let paddleMoveDirectionTouch = 0;

// Countdown variables
let countdownActive = false;
let countdownValue = 3;
let countdownIntervalId = null;

// Touch Controls Visibility
let touchControlsAreVisible = true;
let touchLeftEl, touchRightEl;

// Counters
let horizontal_bounce_counter = 0;
let last_bounce_height = null;
let same_height_bounces = 0;
let consecutive_horizontal_moves = 0;
let previous_ball_centery = ball.y;

// Time variables
let global_start_time = Date.now();
let new_game_timeout_id = null;
let autoSpeedIncreaseIntervalId = null;
let initialAutoSpeedRampActive = false;
let showInitialAutomodeMessage = false;
let initialMessageTimeoutId = null;

// DOM Elements
const autoFollowStatusElement = document.getElementById('autoFollowStatus');

// --- HELPER FUNCTIONS ---
function manageAutoSpeedIncrease() {
    if (autoFollowMode && initialAutoSpeedRampActive && running) {
        if (!autoSpeedIncreaseIntervalId) {
            autoSpeedIncreaseIntervalId = setInterval(() => {
                if (autoFollowMode && initialAutoSpeedRampActive && running) {
                    if (ball.speed < MAX_BALL_SPEED) {
                        let oldSpeed = ball.speed;
                        ball.speed = Math.min(ball.speed + 5, MAX_BALL_SPEED);
                        updateBallSpeedComponents();
                        paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
                        if (paddle.speed < 3) paddle.speed = 3;
                        console.log(`Auto mode (initial ramp): Speed increased from ${oldSpeed.toFixed(1)} to ${ball.speed.toFixed(1)}`);
                        if (ball.speed >= MAX_BALL_SPEED) {
                            initialAutoSpeedRampActive = false;
                            console.log(`Auto mode (initial ramp): Reached MAX speed ${MAX_BALL_SPEED.toFixed(1)}. Ramp finished.`);
                        }
                    } else {
                        initialAutoSpeedRampActive = false;
                    }
                } else {
                    if (autoSpeedIncreaseIntervalId) {
                        clearInterval(autoSpeedIncreaseIntervalId);
                        autoSpeedIncreaseIntervalId = null;
                    }
                }
            }, 2500);
            console.log("Auto mode (initial ramp): +5 speed increase started.");
        }
    } else {
        if (autoSpeedIncreaseIntervalId) {
            clearInterval(autoSpeedIncreaseIntervalId);
            autoSpeedIncreaseIntervalId = null;
            console.log("Auto mode (initial ramp): +5 speed increase stopped/paused.");
        }
    }
}

function updateBallSpeedComponents() {
    const angle = Math.atan2(ball.dy, ball.dx);
    ball.dx = ball.speed * Math.cos(angle);
    ball.dy = ball.speed * Math.sin(angle);
}

function toggleAutoFollow() {
    autoFollowMode = !autoFollowMode;
    if (autoFollowStatusElement) {
        autoFollowStatusElement.textContent = `Auto-Follow: ${autoFollowMode ? 'ON' : 'OFF'}`;
    }
    if (autoFollowMode) {
        paddleMoveDirectionTouch = 0;
    } else {
        initialAutoSpeedRampActive = false;
        console.log("Player took control: Initial auto speed ramp disabled.");
    }

    if (showInitialAutomodeMessage) {
        showInitialAutomodeMessage = false;
        if (initialMessageTimeoutId) {
            clearTimeout(initialMessageTimeoutId);
            initialMessageTimeoutId = null;
        }
    }
    manageAutoSpeedIncrease();
}

function calculateBallAngle() {
    let relative_intersect_x = (ball.x - paddle.x) / paddle.width - 0.5;
    let random_adjustment = Math.random() * 14 - 7;
    let angle_deg;
    if (relative_intersect_x > -0.05 && relative_intersect_x < 0.05) {
        angle_deg = (ball.dx > 0 ? 65 : 115) + random_adjustment;
    } else if (relative_intersect_x < -0.05) {
        angle_deg = 130 + (relative_intersect_x + 0.5) * 40;
    } else {
        angle_deg = 50 + (relative_intersect_x - 0.5) * 40;
    }
    return angle_deg * Math.PI / 180;
}

function ensureNonHorizontal(dx, dy) {
    let current_speed = Math.sqrt(dx * dx + dy * dy);
    if (current_speed === 0) {
        let targetSpeed = ball.speed || DEFAULT_BALL_SPEED;
        if (targetSpeed === 0) targetSpeed = DEFAULT_BALL_SPEED;
        let randomAngleDeg = Math.random() * 360;
        while (randomAngleDeg % 90 === 0 || (randomAngleDeg > -5 && randomAngleDeg < 5) || (randomAngleDeg > 175 && randomAngleDeg < 185) || (randomAngleDeg > 355 || randomAngleDeg < -355) ) {
            randomAngleDeg = Math.random() * 360;
        }
        let randomAngleRad = randomAngleDeg * Math.PI / 180;
        dx = targetSpeed * Math.cos(randomAngleRad);
        dy = targetSpeed * Math.sin(randomAngleRad);
        return [dx, dy];
    }
    const minVerticalRatio = 0.10;
    if (Math.abs(dy / current_speed) < minVerticalRatio) {
        let sign_dy_pref = Math.sign(dy);
        if (sign_dy_pref === 0) {
            sign_dy_pref = (ball.y > SCREEN_HEIGHT / 2) ? -1 : 1;
        }
        dy = sign_dy_pref * current_speed * (minVerticalRatio + Math.random() * 0.05);
        let dx_squared = current_speed * current_speed - dy * dy;
        let sign_dx_pref = Math.sign(dx);
        if (sign_dx_pref === 0) sign_dx_pref = (Math.random() < 0.5 ? 1 : -1);
        dx = sign_dx_pref * Math.sqrt(Math.max(0, dx_squared));
    }
    return [dx, dy];
}

function sanityCheckBallPosition(dx, dy) {
    if (ball.x - ball.radius < 0) {
        ball.x = ball.radius + 0.1;
        dx = Math.abs(dx);
    } else if (ball.x + ball.radius > SCREEN_WIDTH) {
        ball.x = SCREEN_WIDTH - ball.radius - 0.1;
        dx = -Math.abs(dx);
    }
    if (ball.y - ball.radius < 0) {
        ball.y = ball.radius + 0.1;
        dy = Math.abs(dy);
    }
    if (Math.abs(ball.y - previous_ball_centery) < 1) {
        consecutive_horizontal_moves++;
    } else {
        consecutive_horizontal_moves = 0;
    }
    previous_ball_centery = ball.y;
    if (consecutive_horizontal_moves >= 4) {
        const originalSpeed = Math.sqrt(dx * dx + dy * dy);
        dy = originalSpeed * (Math.random() < 0.5 ? -0.3 : 0.3);
        let new_dx_squared = originalSpeed * originalSpeed - dy * dy;
        dx = (dx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, new_dx_squared));
        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && originalSpeed > 0) {
             dx = originalSpeed * (Math.random() < 0.5 ? -1 : 1) * 0.707;
             dy = originalSpeed * (Math.random() < 0.5 ? -1 : 1) * 0.707;
        }
        consecutive_horizontal_moves = 0;
        return ensureNonHorizontal(dx, dy);
    }
    return [dx, dy];
}

function teleportBallToPaddle() {
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.radius - 5;
    return [0, -ball.speed];
}

// --- DRAW FUNCTIONS ---
function drawPaddle() {
    ctx.beginPath();
    ctx.rect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.fillStyle = COLOR_BLUE;
    ctx.fill();
    ctx.closePath();
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_WHITE;
    ctx.fill();
    ctx.closePath();
}

function createBricks() {
    bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
        bricks[r] = [];
        for (let c = 0; c < BRICK_COLS; c++) {
            bricks[r][c] = {
                x: c * (BRICK_WIDTH + BRICK_PADDING) + BRICK_OFFSET_LEFT,
                y: r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP,
                width: BRICK_WIDTH,
                height: BRICK_HEIGHT,
                status: 1
            };
        }
    }
}

function drawBricks() {
    for (let r = 0; r < BRICK_ROWS; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
            if (bricks[r][c].status === 1) {
                ctx.beginPath();
                ctx.rect(bricks[r][c].x, bricks[r][c].y, BRICK_WIDTH, BRICK_HEIGHT);
                ctx.fillStyle = COLOR_RED;
                ctx.fill();
                ctx.closePath();
            }
        }
    }
}

function drawScoreAndInfo() {
    ctx.font = '18px Arial';
    ctx.fillStyle = COLOR_WHITE;
    ctx.textAlign = 'left';
    ctx.fillText(`Speed: ${ball.speed.toFixed(1)}`, 10, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`Score: ${score}`, SCREEN_WIDTH - 10, 20);
    ctx.textAlign = 'left';
    const global_elapsed_time = (Date.now() - global_start_time) / 1000;
    ctx.fillText(`Playtime: ${global_elapsed_time.toFixed(1)}s`, 10, SCREEN_HEIGHT - 10);
    if (showInitialAutomodeMessage) {
        ctx.font = '20px Arial';
        ctx.fillStyle = 'yellow';
        ctx.textAlign = 'center';
        ctx.fillText("Automode enabled. Click screen to take control.", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 100);
    }
}

function drawCountdown() {
    ctx.font = "120px Arial";
    ctx.fillStyle = "rgba(255, 255, 0, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(countdownValue, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 50);

    ctx.font = "24px Arial";
    ctx.fillStyle = "orange";
    ctx.fillText(`Final Score: ${score}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 20);
}

// --- COLLISION DETECTION ---
function handleBrickCollisions() {
    for (let r = 0; r < BRICK_ROWS; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
            const brick = bricks[r][c];
            if (brick.status === 1) {
                const ballLeft = ball.x - ball.radius;
                const ballRight = ball.x + ball.radius;
                const ballTop = ball.y - ball.radius;
                const ballBottom = ball.y + ball.radius;
                if (ballRight > brick.x && ballLeft < brick.x + brick.width &&
                    ballBottom > brick.y && ballTop < brick.y + brick.height) {
                    brick.status = 0;
                    score += 10;
                    const prevBallX = ball.x - ball.dx;
                    const prevBallY = ball.y - ball.dy;
                    let hitFromLeft = (prevBallX + ball.radius <= brick.x) && (ball.x + ball.radius > brick.x);
                    let hitFromRight = (prevBallX - ball.radius >= brick.x + brick.width) && (ball.x - ball.radius < brick.x + brick.width);
                    let hitFromTop = (prevBallY + ball.radius <= brick.y) && (ball.y + ball.radius > brick.y);
                    let hitFromBottom = (prevBallY - ball.radius >= brick.y + brick.height) && (ball.y - ball.radius < brick.y + brick.height);
                    if (hitFromLeft || hitFromRight) {
                        ball.dx = -ball.dx;
                         if (hitFromLeft) ball.x = brick.x - ball.radius - 0.1;
                         else ball.x = brick.x + brick.width + ball.radius + 0.1;
                    } else if (hitFromTop || hitFromBottom) {
                        ball.dy = -ball.dy;
                        if (hitFromTop) ball.y = brick.y - ball.radius - 0.1;
                        else ball.y = brick.y + brick.height + ball.radius + 0.1;
                    } else {
                        const overlapX = (ball.radius + brick.width / 2) - Math.abs(ball.x - (brick.x + brick.width / 2));
                        const overlapY = (ball.radius + brick.height / 2) - Math.abs(ball.y - (brick.y + brick.height / 2));
                        if (overlapX < overlapY) {
                            ball.dx = -ball.dx;
                            ball.x += ball.dx > 0 ? overlapX : -overlapX;
                        } else {
                            ball.dy = -ball.dy;
                            ball.y += ball.dy > 0 ? overlapY : -overlapY;
                        }
                    }
                    [ball.dx, ball.dy] = ensureNonHorizontal(ball.dx, ball.dy);
                    same_height_bounces = 0;
                    if (bricks.flat().every(b => b.status === 0)) {
                        if (!new_game_timeout_id) {
                            console.log("All bricks destroyed! New game in 2.5s.");
                            new_game_timeout_id = setTimeout(() => {
                                resetGame(true, ball.speed);
                                new_game_timeout_id = null;
                            }, 2500);
                        }
                    }
                    return;
                }
            }
        }
    }
}

// --- GAMEPAD CONTROLS ---
const GAMEPAD_DEADZONE = 0.25;
let gamepads = {};

function handleGamepadConnected(e) {
    const gp = e.gamepad;
    console.log(`Gamepad connected at index ${gp.index}: ${gp.id}. ${gp.buttons.length} buttons, ${gp.axes.length} axes.`);
    gamepads[gp.index] = {
        controller: gp,
        prevButtonStates: gp.buttons.map(b => b.pressed)
    };
}

function handleGamepadDisconnected(e) {
    console.log(`Gamepad disconnected from index ${e.gamepad.index}: ${e.gamepad.id}.`);
    delete gamepads[e.gamepad.index];
}

// MODIFIED: This function now ONLY handles single-press action buttons. Movement is handled in update().
function handleGamepadInput() {
    const latestGamepads = navigator.getGamepads();
    if (!latestGamepads) return;

    for (const gp of latestGamepads) {
        if (!gp || !gamepads[gp.index]) continue;

        const prevStates = gamepads[gp.index].prevButtonStates;
        const isButtonPressed = (buttonIndex) => gp.buttons[buttonIndex] && gp.buttons[buttonIndex].pressed && !prevStates[buttonIndex];

        if (isButtonPressed(0)) toggleAutoFollow();
        if (isButtonPressed(1)) { const res = teleportBallToPaddle(); ball.dx = res[0]; ball.dy = res[1]; }
        if (isButtonPressed(9)) resetGame(true, ball.speed);

        const manualSpeedChangeAction = () => {
            updateBallSpeedComponents();
            paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
            if (paddle.speed < 3) paddle.speed = 3;
            if (initialAutoSpeedRampActive) {
                console.log("Manual speed change (gamepad): Initial auto speed ramp disabled.");
                initialAutoSpeedRampActive = false;
                manageAutoSpeedIncrease();
            }
        };

        if (isButtonPressed(5)) {
            ball.speed = Math.min(ball.speed + 2.0, MAX_BALL_SPEED);
            manualSpeedChangeAction();
        }
        if (isButtonPressed(4)) {
             ball.speed = Math.max(ball.speed - 2.0, DEFAULT_BALL_SPEED * 0.5);
             manualSpeedChangeAction();
        }

        gamepads[gp.index].prevButtonStates = gp.buttons.map(b => b.pressed);
    }
}

// --- GAME LOGIC ---
function resetGame(keepScore = false, retainSpeed = null) {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }
    countdownActive = false;

    if (new_game_timeout_id) {
        clearTimeout(new_game_timeout_id);
        new_game_timeout_id = null;
    }

    if (autoFollowStatusElement) {
        autoFollowStatusElement.textContent = `Auto-Follow: ${autoFollowMode ? 'ON' : 'OFF'}`;
    }

    createBricks();
    paddle.x = SCREEN_WIDTH / 2 - paddle.width / 2;
    paddle.y = SCREEN_HEIGHT - 50;

    ball.x = SCREEN_WIDTH / 2;
    ball.y = SCREEN_HEIGHT / 2;

    if (retainSpeed !== null) {
        ball.speed = retainSpeed;
    } else {
        ball.speed = DEFAULT_BALL_SPEED;
    }
    let initialAngle = (Math.random() * 60 + 240) * Math.PI / 180;
    if (Math.random() < 0.5) initialAngle = (Math.random() * 60 + 30) * Math.PI / 180;
    ball.dx = ball.speed * Math.cos(initialAngle);
    ball.dy = ball.speed * Math.sin(initialAngle);
    if (ball.dy < 0 && initialAngle < Math.PI) ball.dy = -ball.dy;
    else if (ball.dy > 0 && initialAngle > Math.PI) ball.dy = -ball.dy;
    [ball.dx, ball.dy] = ensureNonHorizontal(ball.dx, ball.dy);

    paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
    if (paddle.speed < 3) paddle.speed = 3;

    if (!keepScore) {
        score = 0;
        global_start_time = Date.now();
        showInitialAutomodeMessage = true;
        initialAutoSpeedRampActive = true;
        if (initialMessageTimeoutId) clearTimeout(initialMessageTimeoutId);
        initialMessageTimeoutId = setTimeout(() => {
            showInitialAutomodeMessage = false;
            initialMessageTimeoutId = null;
        }, 15000);
    } else {
        showInitialAutomodeMessage = false;
        initialAutoSpeedRampActive = false;
        if (initialMessageTimeoutId) {
            clearTimeout(initialMessageTimeoutId);
            initialMessageTimeoutId = null;
        }
    }

    horizontal_bounce_counter = 0;
    last_bounce_height = null;
    same_height_bounces = 0;
    consecutive_horizontal_moves = 0;
    previous_ball_centery = ball.y;
    paddleMoveDirectionTouch = 0;

    running = true;
    if (!animationFrameId) {
        gameLoop();
    }
    manageAutoSpeedIncrease();
}

let keysPressed = {};
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keysPressed[key] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
    }
    if (key === 'a') toggleAutoFollow();
    if (key === ' ') {
        const teleportResult = teleportBallToPaddle();
        ball.dx = teleportResult[0];
        ball.dy = teleportResult[1];
    }
    if (key === 'n') {
        resetGame(true, ball.speed);
    }
    if (key === 't') {
        toggleTouchControls();
    }
});
document.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});

// --- MOUSE & DIRECT TOUCH CONTROLS ---
function handleMouseMove(e) {
    // Only move the paddle if auto-follow mode is OFF.
    if (!autoFollowMode) {
        const rect = canvas.getBoundingClientRect();
        let mouseX = e.clientX - rect.left;
        paddle.x = mouseX - paddle.width / 2;
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.width > SCREEN_WIDTH) paddle.x = SCREEN_WIDTH - paddle.width;
    }
}

function handleInput() {
    let speedChangedManually = false;
    if (keysPressed['arrowup']) {
        ball.speed = Math.min(ball.speed + 0.1, MAX_BALL_SPEED);
        speedChangedManually = true;
    }
    if (keysPressed['arrowdown']) {
        ball.speed = Math.max(ball.speed - 0.1, DEFAULT_BALL_SPEED * 0.5);
        speedChangedManually = true;
    }

    if (speedChangedManually) {
        updateBallSpeedComponents();
        paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
        if (paddle.speed < 3) paddle.speed = 3;
        if (initialAutoSpeedRampActive) {
            console.log("Manual speed change: Initial auto speed ramp disabled.");
            initialAutoSpeedRampActive = false;
            manageAutoSpeedIncrease();
        }
    }
}

// MODIFIED: This function now contains all paddle movement logic for correctness.
function update() {
    handleGamepadInput(); // Handles action buttons
    handleInput(); // Handles keyboard speed changes
    const ballPrevY = ball.y;

    if (!autoFollowMode) {
        let analogStickMovement = 0;
        let dPadMovement = 0;

        // Poll fresh gamepad data for movement THIS FRAME
        const latestGamepads = navigator.getGamepads();
        if (latestGamepads) {
            for (const gp of latestGamepads) {
                if (!gp) continue;
                // PRIORITY 1: Analog Stick
                if (Math.abs(gp.axes[0]) > GAMEPAD_DEADZONE) {
                    analogStickMovement = gp.axes[0];
                    break; // Use the first active analog stick and stop searching
                }
                // PRIORITY 2: D-Pad (if no analog stick movement on this controller)
                if (gp.buttons[14] && gp.buttons[14].pressed) {
                    dPadMovement = -1;
                    break; // Use D-pad and stop searching
                } else if (gp.buttons[15] && gp.buttons[15].pressed) {
                    dPadMovement = 1;
                    break; // Use D-pad and stop searching
                }
            }
        }
        
        // Apply movement based on priority (for keyboard/gamepad/buttons)
        // Mouse and direct touch are handled by their own event listeners
        if (analogStickMovement !== 0) {
            // Analog movement is smooth
            paddle.x += analogStickMovement * paddle.speed * 1.2;
        } else {
            // Fallback to digital inputs (D-Pad > Keyboard > Touch Buttons)
            let netPaddleMovement = 0;
            if (dPadMovement !== 0) netPaddleMovement = dPadMovement;
            else if (keysPressed['arrowleft']) netPaddleMovement = -1;
            else if (keysPressed['arrowright']) netPaddleMovement = 1;
            else if (paddleMoveDirectionTouch !== 0) netPaddleMovement = paddleMoveDirectionTouch;
            
            if (netPaddleMovement !== 0) {
                paddle.x += netPaddleMovement * paddle.speed;
            }
        }
        
        // Clamp paddle position to screen bounds
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.width > SCREEN_WIDTH) paddle.x = SCREEN_WIDTH - paddle.width;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x + ball.radius > SCREEN_WIDTH) {
        ball.x = SCREEN_WIDTH - ball.radius; ball.dx = -ball.dx;
    } else if (ball.x - ball.radius < 0) {
        ball.x = ball.radius; ball.dx = -ball.dx;
    }
    if (ball.y - ball.radius < 0) {
        ball.y = ball.radius; ball.dy = -ball.dy; horizontal_bounce_counter = 0;
    }
    [ball.dx, ball.dy] = ensureNonHorizontal(ball.dx, ball.dy);
    [ball.dx, ball.dy] = sanityCheckBallPosition(ball.dx, ball.dy);

    if (ball.y + ball.radius > SCREEN_HEIGHT && running) {
        console.log("Game Over - Starting countdown...");
        running = false;
        initialAutoSpeedRampActive = false;
        manageAutoSpeedIncrease();

        countdownActive = true;
        countdownValue = 3;

        if (countdownIntervalId) clearInterval(countdownIntervalId);

        countdownIntervalId = setInterval(() => {
            countdownValue--;
            if (countdownValue <= 0) {
                clearInterval(countdownIntervalId);
                countdownIntervalId = null;
                resetGame(false);
            }
        }, 1000);
    }

    if (autoFollowMode) {
        paddle.x = ball.x - paddle.width / 2;
        if (paddle.x < 0) paddle.x = 0;
        if (paddle.x + paddle.width > SCREEN_WIDTH) paddle.x = SCREEN_WIDTH - paddle.width;
    }

    if (ball.dy > 0) {
        const ballPrevBottom = ballPrevY + ball.radius;
        const ballCurrentBottom = ball.y + ball.radius;
        const ballCurrentTop = ball.y - ball.radius;
        const paddleTop = paddle.y;
        const paddleBottom = paddle.y + paddle.height;
        if (ball.x + ball.radius >= paddle.x && ball.x - ball.radius <= paddle.x + paddle.width) {
            if ((ballPrevBottom <= paddleTop && ballCurrentBottom >= paddleTop) ||
                (ballCurrentTop < paddleBottom && ballCurrentBottom > paddleTop)) {
                const bounce_angle = calculateBallAngle();
                ball.dx = ball.speed * Math.cos(bounce_angle);
                ball.dy = -ball.speed * Math.sin(bounce_angle);
                ball.y = paddle.y - ball.radius - 0.1;
                [ball.dx, ball.dy] = ensureNonHorizontal(ball.dx, ball.dy);
                horizontal_bounce_counter = 0; same_height_bounces = 0; last_bounce_height = null;
                if (autoFollowMode) ball.y -= 2;
            }
        }
    }
    handleBrickCollisions();
}

function draw() {
    ctx.fillStyle = COLOR_BLACK;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    drawPaddle();
    drawBricks();
    drawBall();
    drawScoreAndInfo();

    if (countdownActive) {
        drawCountdown();
    }
}

function gameLoop() {
    if (running) {
        update();
    }
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- TOUCH CONTROLS VISIBILITY ---
function updateTouchControlsAppearance() {
    if (touchLeftEl && touchRightEl) {
        if (touchControlsAreVisible) {
            touchLeftEl.classList.remove('hidden');
            touchRightEl.classList.remove('hidden');
        } else {
            touchLeftEl.classList.add('hidden');
            touchRightEl.classList.add('hidden');
        }
    }
}
function toggleTouchControls() {
    touchControlsAreVisible = !touchControlsAreVisible;
    updateTouchControlsAppearance();
}

// --- BUTTON CONTROLS SETUP ---
function setupButtonControls() {
    const btnMoveLeft = document.getElementById('btnMoveLeft');
    const btnMoveRight = document.getElementById('btnMoveRight');
    const btnIncreaseSpeed = document.getElementById('btnIncreaseSpeed');
    const btnDecreaseSpeed = document.getElementById('btnDecreaseSpeed');
    const btnToggleAutoFollow = document.getElementById('btnToggleAutoFollow');
    const btnTeleportBall = document.getElementById('btnTeleportBall');
    const btnNewGame = document.getElementById('btnNewGame');
    const btnToggleTouch = document.getElementById('btnToggleTouch');

    if (btnMoveLeft) btnMoveLeft.addEventListener('click', () => { if (!autoFollowMode && paddle.x > 0) paddle.x = Math.max(0, paddle.x - paddle.speed * 2); });
    if (btnMoveRight) btnMoveRight.addEventListener('click', () => { if (!autoFollowMode && paddle.x + paddle.width < SCREEN_WIDTH) paddle.x = Math.min(SCREEN_WIDTH - paddle.width, paddle.x + paddle.speed * 2); });

    const manualSpeedChangeAction = () => {
        updateBallSpeedComponents();
        paddle.speed = PADDLE_SPEED_RATIO * ball.speed;
        if (paddle.speed < 3) paddle.speed = 3;
        if (initialAutoSpeedRampActive) {
            console.log("Manual speed change (button): Initial auto speed ramp disabled.");
            initialAutoSpeedRampActive = false;
            manageAutoSpeedIncrease();
        }
    };

    if (btnIncreaseSpeed) btnIncreaseSpeed.addEventListener('click', () => { ball.speed = Math.min(ball.speed + 0.1, MAX_BALL_SPEED); manualSpeedChangeAction(); });
    if (btnDecreaseSpeed) btnDecreaseSpeed.addEventListener('click', () => { ball.speed = Math.max(ball.speed - 0.1, DEFAULT_BALL_SPEED * 0.5); manualSpeedChangeAction(); });

    if (btnToggleAutoFollow) btnToggleAutoFollow.addEventListener('click', toggleAutoFollow);
    if (btnTeleportBall) btnTeleportBall.addEventListener('click', () => { const res = teleportBallToPaddle(); ball.dx = res[0]; ball.dy = res[1]; });
    if (btnNewGame) btnNewGame.addEventListener('click', () => resetGame(true, ball.speed));
    if (btnToggleTouch) btnToggleTouch.addEventListener('click', toggleTouchControls);
}

// --- TOUCH CONTROLS SETUP ---
function setupTouchControls() {
    touchLeftEl = document.getElementById('touchControlLeft');
    touchRightEl = document.getElementById('touchControlRight');
    updateTouchControlsAppearance();
    if (!touchLeftEl || !touchRightEl) return;
    const handleTouchStart = (direction) => { 
        if(autoFollowMode) toggleAutoFollow(); // Take control by using buttons
        paddleMoveDirectionTouch = direction; 
    };
    const handleTouchEnd = () => { paddleMoveDirectionTouch = 0; };
    ['mousedown', 'touchstart'].forEach(evtType => {
        touchLeftEl.addEventListener(evtType, (e) => { e.preventDefault(); handleTouchStart(-1); }, { passive: false });
        touchRightEl.addEventListener(evtType, (e) => { e.preventDefault(); handleTouchStart(1); }, { passive: false });
    });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evtType => {
        // Use a global listener to ensure touch release is always caught
        document.addEventListener(evtType, () => { 
            if (paddleMoveDirectionTouch !== 0) {
                 handleTouchEnd();
            }
        });
    });
}

// --- INITIALIZE AND START GAME ---
document.addEventListener('DOMContentLoaded', () => {
    setupButtonControls();
    setupTouchControls();
    
    // Set up listeners for direct canvas control (mouse and touch)
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', (e) => {
        if (!autoFollowMode) {
            e.preventDefault(); // Prevent page scrolling
            if (e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                let touchX = e.touches[0].clientX - rect.left;
                paddle.x = touchX - paddle.width / 2;
                if (paddle.x < 0) paddle.x = 0;
                if (paddle.x + paddle.width > SCREEN_WIDTH) paddle.x = SCREEN_WIDTH - paddle.width;
            }
        }
    }, { passive: false });

    // Function to activate manual control on the first click or tap on the canvas
    const activateManualControl = (e) => {
        if (autoFollowMode) {
            e.preventDefault();
            toggleAutoFollow();
        }
    };
    canvas.addEventListener('mousedown', activateManualControl);
    canvas.addEventListener('touchstart', activateManualControl, { passive: false });

    // Gamepad listeners
    window.addEventListener("gamepadconnected", handleGamepadConnected);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);
    
    // Start the game
    resetGame();
});

// ==========================================================
// --- FULLSCREEN & MOBILE CONTROLS LOGIC (APPENDED) ---
// ==========================================================

const mobileToggleBtn = document.getElementById('mobile-btn');
const mobileControls = document.getElementById('mobile-controls');
const mobileLeftBtn = document.getElementById('mobile-left');
const mobileRightBtn = document.getElementById('mobile-right');
const mobileUpBtn = document.getElementById('mobile-up');
const screenElement = document.getElementById("screen");

// --- 1. SCALING LOGIC ---
function scaleGame() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    
    if (isFullscreen) {
        // Base dimensions of the game canvas
        const baseWidth = SCREEN_WIDTH;
        const baseHeight = SCREEN_HEIGHT;
        
        // Calculate the scale to fit the window while maintaining aspect ratio
        const scale = Math.min(
            window.innerWidth / baseWidth,
            window.innerHeight / baseHeight
        );
        
        screenElement.style.transform = `scale(${scale})`;
        document.body.classList.add('mobile-mode'); // Activates CSS lock
    } else {
        screenElement.style.transform = 'none'; 
        document.body.classList.remove('mobile-mode');
    }
}

// --- 2. FULLSCREEN TRIGGER ---
function goFull() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.log(err));
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }
}

// Listeners for resizing and fullscreen changes
window.addEventListener("resize", scaleGame);
window.addEventListener("fullscreenchange", scaleGame);
window.addEventListener("webkitfullscreenchange", scaleGame);

// Initial check
scaleGame();

// Button Listener
if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener('click', goFull);
}

// --- 3. MOBILE CONTROLS LOGIC ---
function setupMobileOverlayControls() {
    if (!mobileControls) return;

    // Helper to map touch/mouse events to our existing 'keysPressed' object
    const addControlListener = (element, key, actionFn = null) => {
        const pressKey = (e) => {
            // Prevent default browser zooming/scrolling behavior
            if(e.cancelable) e.preventDefault(); 
            
            // Auto-break AutoFollow if D-pad is used manually
            if ((key === 'arrowleft' || key === 'arrowright') && autoFollowMode) {
                toggleAutoFollow();
            }
            
            keysPressed[key] = true;
            if (actionFn) actionFn();
        };
        const releaseKey = (e) => {
            if(e.cancelable) e.preventDefault();
            keysPressed[key] = false;
        };

        // Touch Events
        element.addEventListener('touchstart', pressKey, { passive: false });
        element.addEventListener('touchend', releaseKey, { passive: false });
        element.addEventListener('touchcancel', releaseKey, { passive: false });
        
        // Mouse Events (for testing on desktop)
        element.addEventListener('mousedown', pressKey);
        element.addEventListener('mouseup', releaseKey);
        element.addEventListener('mouseleave', (e) => {
            if (e.buttons === 1) { releaseKey(e); }
        });
    };

    // Map Buttons to Existing Key Logic
    addControlListener(mobileLeftBtn, 'arrowleft');   // Left movement mapped to left arrow logic
    addControlListener(mobileRightBtn, 'arrowright'); // Right movement mapped to right arrow logic
    
    // Action mapped to spacebar logic (Teleport / Launch ball)
    addControlListener(mobileUpBtn, ' ', () => {
        const teleportResult = teleportBallToPaddle();
        ball.dx = teleportResult[0];
        ball.dy = teleportResult[1];
    });
}

// Initialize overlay controls
setupMobileOverlayControls();
