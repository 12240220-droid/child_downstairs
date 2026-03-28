/**
 * 小朋友下樓梯 Core Game Logic
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hpBar = document.getElementById('hp-bar');
const scoreEl = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const menu = document.getElementById('menu');
const gameOverScreen = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');

// 遊戲參數
const CONFIG = {
    canvasWidth: 400,
    canvasHeight: 600,
    gravity: 0.5,
    maxFallSpeed: 10,
    jumpForce: -12,
    playerSpeed: 5,
    scrollSpeed: 2,
    platformSpawnRate: 1500, // ms
    maxHP: 100,
    spikeDamage: 20,
    healRate: 0.05,
    topSpikeHeight: 30
};

canvas.width = CONFIG.canvasWidth;
canvas.height = CONFIG.canvasHeight;

let gameState = 'MENU'; // MENU, PLAYING, GAME_OVER
let player;
let platforms = [];
let lastPlatformSpawn = 0;
let score = 0;
let level = 0;
let keys = {};

// 鍵盤監聽
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

class Player {
    constructor() {
        this.width = 24;
        this.height = 24;
        this.x = CONFIG.canvasWidth / 2 - this.width / 2;
        this.y = 100;
        this.vx = 0;
        this.vy = 0;
        this.hp = CONFIG.maxHP;
        this.onPlatform = null;
    }

    update() {
        // 重力與水平移動
        if (keys['ArrowLeft']) this.vx = -CONFIG.playerSpeed;
        else if (keys['ArrowRight']) this.vx = CONFIG.playerSpeed;
        else this.vx = 0;

        if (this.onPlatform) {
            this.vy = -CONFIG.scrollSpeed;
            this.y = this.onPlatform.y - this.height;
            
            // 站在普通階梯回血
            if (this.onPlatform.type === 'NORMAL' && this.hp < CONFIG.maxHP) {
                this.hp += CONFIG.healRate;
            }
            
            // 輸送帶效果
            if (this.onPlatform.type === 'CONVEYOR_L') this.x -= 2;
            if (this.onPlatform.type === 'CONVEYOR_R') this.x += 2;

            // 檢查是否掉出平台
            if (this.x + this.width < this.onPlatform.x || this.x > this.onPlatform.x + this.onPlatform.width) {
                this.onPlatform = null;
            }
        } else {
            this.vy += CONFIG.gravity;
            if (this.vy > CONFIG.maxFallSpeed) this.vy = CONFIG.maxFallSpeed;
        }

        this.x += this.vx;
        this.y += this.vy;

        // 邊界檢查
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > CONFIG.canvasWidth) this.x = CONFIG.canvasWidth - this.width;

        // 頂部尖刺檢查
        if (this.y < CONFIG.topSpikeHeight) {
            this.y = CONFIG.topSpikeHeight;
            this.hp -= 0.5; // 持續性傷害
        }

        // 死亡判定
        if (this.hp <= 0 || this.y > CONFIG.canvasHeight) {
            endGame();
        }

        // 更新 UI
        hpBar.style.width = Math.max(0, (this.hp / CONFIG.maxHP) * 100) + '%';
    }

    draw() {
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 眼睛，讓角色有方向感 (簡單設計)
        ctx.fillStyle = 'white';
        let eyeOffset = this.vx > 0 ? 12 : (this.vx < 0 ? 2 : 7);
        ctx.fillRect(this.x + eyeOffset, this.y + 5, 4, 4);
        ctx.fillRect(this.x + eyeOffset + 6, this.y + 5, 4, 4);
    }
}

class Platform {
    constructor(y, type) {
        this.width = 80;
        this.height = 15;
        this.x = Math.random() * (CONFIG.canvasWidth - this.width);
        this.y = y;
        this.type = type || 'NORMAL';
        this.color = this.getColor();
        this.stepped = false;
        this.timer = 0; // 用於脆弱階梯
    }

    getColor() {
        switch (this.type) {
            case 'NORMAL': return '#2ecc71';
            case 'SPIKE': return '#7f8c8d';
            case 'CONVEYOR_L':
            case 'CONVEYOR_R': return '#f1c40f';
            case 'SPRING': return '#3498db';
            case 'FRAGILE': return '#e67e22';
            default: return '#fff';
        }
    }

    update() {
        this.y -= CONFIG.scrollSpeed;

        // 脆弱階梯邏輯
        if (this.type === 'FRAGILE' && this.stepped) {
            this.timer++;
            if (this.timer > 30) return false; // 0.5秒後消失
        }

        return this.y + this.height > 0;
    }

    draw() {
        ctx.fillStyle = this.color;
        
        // 畫出主體
        if (this.type === 'FRAGILE' && this.stepped) {
            ctx.globalAlpha = 1 - (this.timer / 30);
        }
        
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 畫出尖刺
        if (this.type === 'SPIKE') {
            ctx.fillStyle = '#c0392b';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.moveTo(this.x + i * 16, this.y);
                ctx.lineTo(this.x + i * 16 + 8, this.y - 8);
                ctx.lineTo(this.x + i * 16 + 16, this.y);
                ctx.fill();
            }
        }

        // 畫出輸送帶箭頭
        if (this.type === 'CONVEYOR_L' || this.type === 'CONVEYOR_R') {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            const arrow = this.type === 'CONVEYOR_L' ? '<' : '>';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(arrow.repeat(5), this.x + 10, this.y + 12);
        }

        ctx.globalAlpha = 1.0;
    }
}

function spawnPlatform() {
    const types = ['NORMAL', 'NORMAL', 'NORMAL', 'SPIKE', 'SPRING', 'CONVEYOR_L', 'CONVEYOR_R', 'FRAGILE'];
    const type = types[Math.floor(Math.random() * types.length)];
    platforms.push(new Platform(CONFIG.canvasHeight, type));
}

function checkCollisions() {
    if (player.vy < 0) return; // 只有在掉落時才偵測碰撞

    for (let platform of platforms) {
        if (
            player.x + player.width > platform.x &&
            player.x < platform.x + platform.width &&
            player.y + player.height > platform.y &&
            player.y + player.height < platform.y + platform.height + player.vy
        ) {
            // 踩上平台
            player.onPlatform = platform;
            player.y = platform.y - player.height;
            player.vy = 0;

            if (!platform.stepped) {
                platform.stepped = true;
                score++;
                scoreEl.innerText = `層數: ${score}`;

                // 尖刺傷害
                if (platform.type === 'SPIKE') {
                    player.hp -= CONFIG.spikeDamage;
                }
                
                // 彈簧效果
                if (platform.type === 'SPRING') {
                    player.vy = CONFIG.jumpForce;
                    player.onPlatform = null;
                }
            }
            break;
        }
    }
}

function drawTopSpikes() {
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.topSpikeHeight - 10);
    
    ctx.fillStyle = '#999';
    for (let i = 0; i < CONFIG.canvasWidth / 20; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 20, CONFIG.topSpikeHeight - 10);
        ctx.lineTo(i * 20 + 10, CONFIG.topSpikeHeight);
        ctx.lineTo(i * 20 + 20, CONFIG.topSpikeHeight - 10);
        ctx.fill();
    }
}

function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 生成階梯
    if (timestamp - lastPlatformSpawn > CONFIG.platformSpawnRate) {
        spawnPlatform();
        lastPlatformSpawn = timestamp;
    }

    // 更新與繪製階梯
    platforms = platforms.filter(p => {
        const active = p.update();
        p.draw();
        return active;
    });

    // 更新與繪製玩家
    player.update();
    checkCollisions();
    player.draw();

    // 繪製天花板
    drawTopSpikes();

    requestAnimationFrame(gameLoop);
}

function startGame() {
    gameState = 'PLAYING';
    player = new Player();
    platforms = [];
    score = 0;
    scoreEl.innerText = `層數: 0`;
    lastPlatformSpawn = 0;
    
    // 初始階梯
    platforms.push(new Platform(200, 'NORMAL'));
    
    menu.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameState = 'GAME_OVER';
    finalScoreEl.innerText = `最終層數: ${score}`;
    gameOverScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// 背景裝飾 (選單畫面時)
function drawMenuBG() {
    if (gameState === 'MENU') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.font = '200px Arial';
        ctx.fillText('↓', 100, 400);
        requestAnimationFrame(drawMenuBG);
    }
}
drawMenuBG();
