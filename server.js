const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Хранилище игр (для множества одновременных игр)
const games = new Map();

// Генерация кода комнаты
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const questions = [
    "Худший подарок на день рождения?",
    "Что бы вы крикнули, прыгая с парашютом?",
    "Название вашей автобиографии?",
    "Последние слова супергероя?",
    "Худший рекламный слоган для похоронного бюро?",
    "Что написано на вашей футболке?",
    "Новое название для понедельника?",
    "Худший совет для первого свидания?",
    "Название вашей рок-группы?",
    "Что нельзя говорить полицейскому?",
    "Секретный ингредиент бабушкиного супа?",
    "Название нового вида спорта?",
    "Что вы никогда не скажете на собеседовании?",
    "Худшее имя для домашнего питомца?",
    "Слоган для вашего ресторана быстрого питания?"
];

io.on('connection', (socket) => {
    console.log('🔌 Подключился:', socket.id);
    
    let currentRoom = null;
    let isHost = false;

    // Создание новой игры (HOST)
    socket.on('createGame', () => {
        const roomCode = generateRoomCode();
        currentRoom = roomCode;
        isHost = true;

        games.set(roomCode, {
            host: socket.id,
            players: [],
            phase: 'lobby',
            answers: {},
            votes: {},
            scores: {},
            currentQuestion: 0
        });

        socket.join(roomCode);
        socket.emit('gameCreated', { roomCode });
        console.log(`🎮 Создана игра: ${roomCode}`);
    });

    // Подключение игрока
    socket.on('joinGame', (data) => {
        const { roomCode, name, avatar } = data;
        const game = games.get(roomCode);

        if (!game) {
            socket.emit('error', 'Игра не найдена!');
            return;
        }

        if (game.phase !== 'lobby') {
            socket.emit('error', 'Игра уже началась!');
            return;
        }

        const player = {
            id: socket.id,
            name: name,
            avatar: avatar
        };

        game.players.push(player);
        game.scores[socket.id] = 0;
        
        currentRoom = roomCode;
        socket.join(roomCode);

        io.to(roomCode).emit('playerJoined', { player, players: game.players });
        socket.emit('joinSuccess', player);

        console.log(`👤 ${name} присоединился к ${roomCode}`);
    });

    // Начало игры
    socket.on('startGame', () => {
        if (!isHost || !currentRoom) return;

        const game = games.get(currentRoom);
        if (!game || game.players.length < 2) {
            socket.emit('error', 'Нужно минимум 2 игрока!');
            return;
        }

        game.phase = 'answering';
        game.currentQuestion = 0;
        game.answers = {};

        const question = questions[game.currentQuestion];
        io.to(currentRoom).emit('gameStarted', {
            question,
            round: 1,
            total: Math.min(questions.length, 7)
        });

        console.log(`▶️ Игра ${currentRoom} началась!`);
    });

    // Отправка ответа
    socket.on('submitAnswer', (answer) => {
        if (!currentRoom) return;

        const game = games.get(currentRoom);
        if (!game) return;

        game.answers[socket.id] = answer;

        io.to(currentRoom).emit('answerProgress', {
            current: Object.keys(game.answers).length,
            total: game.players.length
        });

        // Все ответили
        if (Object.keys(game.answers).length === game.players.length) {
            setTimeout(() => startVoting(currentRoom), 2000);
        }
    });

    // Голосование
    socket.on('vote', (answerId) => {
        if (!currentRoom) return;

        const game = games.get(currentRoom);
        if (!game || game.votes[socket.id]) return;

        if (answerId === socket.id) {
            socket.emit('error', 'Нельзя голосовать за себя!');
            return;
        }

        game.votes[socket.id] = answerId;
        game.scores[answerId] = (game.scores[answerId] || 0) + 1000;

        io.to(currentRoom).emit('voteProgress', {
            current: Object.keys(game.votes).length,
            total: game.players.length
        });

        // Все проголосовали
        if (Object.keys(game.votes).length === game.players.length) {
            setTimeout(() => showResults(currentRoom), 2000);
        }
    });

    // Следующий раунд
    socket.on('nextRound', () => {
        if (!isHost || !currentRoom) return;

        const game = games.get(currentRoom);
        if (!game) return;

        game.currentQuestion++;

        if (game.currentQuestion >= Math.min(questions.length, 7)) {
            endGame(currentRoom);
        } else {
            game.phase = 'answering';
            game.answers = {};
            game.votes = {};

            const question = questions[game.currentQuestion];
            io.to(currentRoom).emit('newRound', {
                question,
                round: game.currentQuestion + 1,
                total: Math.min(questions.length, 7)
            });
        }
    });

    // Отключение
    socket.on('disconnect', () => {
        if (currentRoom) {
            const game = games.get(currentRoom);
            if (game) {
                // Если отключился хост - закрываем игру
                if (isHost) {
                    io.to(currentRoom).emit('hostLeft');
                    games.delete(currentRoom);
                    console.log(`❌ Игра ${currentRoom} закрыта (хост вышел)`);
                } else {
                    // Удаляем игрока
                    game.players = game.players.filter(p => p.id !== socket.id);
                    delete game.scores[socket.id];
                    delete game.answers[socket.id];
                    delete game.votes[socket.id];

                    io.to(currentRoom).emit('playerLeft', {
                        playerId: socket.id,
                        players: game.players
                    });
                }
            }
        }
        console.log('❌ Отключился:', socket.id);
    });

    // Вспомогательные функции
    function startVoting(roomCode) {
        const game = games.get(roomCode);
        if (!game) return;

        game.phase = 'voting';
        game.votes = {};

        const answersArray = Object.entries(game.answers).map(([id, text]) => ({
            id,
            text,
            player: game.players.find(p => p.id === id)
        }));

        // Перемешиваем
        answersArray.sort(() => Math.random() - 0.5);

        io.to(roomCode).emit('votingStarted', {
            question: questions[game.currentQuestion],
            answers: answersArray
        });
    }

    function showResults(roomCode) {
        const game = games.get(roomCode);
        if (!game) return;

        game.phase = 'results';

        const results = Object.entries(game.answers).map(([id, answer]) => {
            const player = game.players.find(p => p.id === id);
            const votesCount = Object.values(game.votes).filter(v => v === id).length;

            return {
                id,
                name: player?.name,
                avatar: player?.avatar,
                answer,
                votes: votesCount,
                score: game.scores[id]
            };
        }).sort((a, b) => b.votes - a.votes);

        io.to(roomCode).emit('roundResults', results);
    }

    function endGame(roomCode) {
        const game = games.get(roomCode);
        if (!game) return;

        game.phase = 'finished';

        const finalScores = game.players.map(p => ({
            name: p.name,
            avatar: p.avatar,
            score: game.scores[p.id] || 0
        })).sort((a, b) => b.score - a.score);

        io.to(roomCode).emit('gameFinished', finalScores);
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('\n🎉 ================================');
    console.log('   СМЕХЛЫСТ - Сервер запущен!');
    console.log('================================');
    console.log(`\n🌐 Откройте: http://localhost:${PORT}/host.html`);
    console.log(`📱 Или деплойте на Render.com для онлайн доступа!\n`);
});