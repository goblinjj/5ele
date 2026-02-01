import { Room, Client } from 'colyseus';
import { GamePhase } from '@xiyou/shared';

interface GameState {
  phase: GamePhase;
  round: number;
  maxRounds: number;
  players: Map<string, PlayerData>;
}

interface PlayerData {
  id: string;
  name: string;
  isReady: boolean;
}

export class GameRoom extends Room<GameState> {
  maxClients = 4;

  onCreate(options: any): void {
    console.log('房间创建:', this.roomId);

    this.setState({
      phase: GamePhase.WAITING,
      round: 0,
      maxRounds: 6,
      players: new Map(),
    });

    // 处理玩家准备
    this.onMessage('ready', (client, message) => {
      this.handleReady(client);
    });

    // 处理节点选择
    this.onMessage('selectNode', (client, message) => {
      this.handleNodeSelect(client, message.nodeIndex);
    });

    // 处理奖励选择
    this.onMessage('selectReward', (client, message) => {
      this.handleRewardSelect(client, message.rewardIndex);
    });
  }

  onJoin(client: Client, options: any): void {
    console.log('玩家加入:', client.sessionId);

    const playerData: PlayerData = {
      id: client.sessionId,
      name: options.name || `玩家${this.state.players.size + 1}`,
      isReady: false,
    };

    this.state.players.set(client.sessionId, playerData);

    // 通知所有玩家
    this.broadcast('playerJoined', {
      playerId: client.sessionId,
      playerCount: this.state.players.size,
    });
  }

  onLeave(client: Client, consented: boolean): void {
    console.log('玩家离开:', client.sessionId);

    this.state.players.delete(client.sessionId);

    this.broadcast('playerLeft', {
      playerId: client.sessionId,
      playerCount: this.state.players.size,
    });
  }

  onDispose(): void {
    console.log('房间销毁:', this.roomId);
  }

  private handleReady(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isReady = true;
    }

    // 检查是否所有玩家都准备好了
    const allReady = Array.from(this.state.players.values()).every(p => p.isReady);
    const enoughPlayers = this.state.players.size >= 2;

    if (allReady && enoughPlayers) {
      this.startGame();
    }
  }

  private startGame(): void {
    console.log('游戏开始!');

    this.state.phase = GamePhase.EXPLORING;
    this.state.round = 1;

    this.broadcast('gameStart', {
      phase: this.state.phase,
      round: this.state.round,
      players: Array.from(this.state.players.values()),
    });
  }

  private handleNodeSelect(client: Client, nodeIndex: number): void {
    // TODO: 处理节点选择逻辑
    console.log(`玩家 ${client.sessionId} 选择了节点 ${nodeIndex}`);
  }

  private handleRewardSelect(client: Client, rewardIndex: number): void {
    // TODO: 处理奖励选择逻辑
    console.log(`玩家 ${client.sessionId} 选择了奖励 ${rewardIndex}`);
  }
}
