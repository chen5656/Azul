import pygame
import random
from typing import List, Tuple, Dict

# 初始化颜色常量 - 调整为更柔和的颜色
BLUE = (100, 140, 255)    # 柔和的蓝色
YELLOW = (255, 230, 150)  # 柔和的黄色
RED = (255, 130, 130)     # 柔和的红色
BLACK = (100, 100, 100)   # 柔和的黑色（深灰）
WHITE = (240, 240, 240)   # 柔和的白色（浅灰）
GRAY = (128, 128, 128)
BACKGROUND = (200, 200, 200)

# 游戏配置
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
PIECE_SIZE = 30
DISK_SIZE = 80

class GameState:
    INIT = "INIT"         # 游戏初始状态
    RUNNING = "RUNNING"   # 游戏进行中
    SCORING = "SCORING"   # 结算阶段
    END = "END"          # 游戏结束

class Button:
    def __init__(self, x: int, y: int, width: int, height: int, text: str):
        self.rect = pygame.Rect(x, y, width, height)
        self.text = text
        self.enabled = True
        
    def draw(self, screen: pygame.Surface):
        color = GRAY if self.enabled else (160, 160, 160)
        pygame.draw.rect(screen, color, self.rect)
        pygame.draw.rect(screen, BLACK, self.rect, 2)
        
        font = pygame.font.Font(None, 36)
        text_surface = font.render(self.text, True, BLACK if self.enabled else (100, 100, 100))
        text_rect = text_surface.get_rect(center=self.rect.center)
        screen.blit(text_surface, text_rect)
        
    def is_clicked(self, pos) -> bool:
        return self.enabled and self.rect.collidepoint(pos)

class Piece:
    def __init__(self, color: Tuple[int, int, int], is_first: bool = False):
        self.color = color
        self.rect = pygame.Rect(0, 0, PIECE_SIZE, PIECE_SIZE)
        self.is_first = is_first
        self.selected = False  # 添加选中状态
        
    def draw(self, screen: pygame.Surface, x: int, y: int):
        self.rect.x = x
        self.rect.y = y
        if self.is_first:
            # 绘制菱形
            points = [
                (x + PIECE_SIZE//2, y),  # 上
                (x + PIECE_SIZE, y + PIECE_SIZE//2),  # 右
                (x + PIECE_SIZE//2, y + PIECE_SIZE),  # 下
                (x, y + PIECE_SIZE//2)  # 左
            ]
            pygame.draw.polygon(screen, self.color, points)
            # 双层边框
            pygame.draw.polygon(screen, BLACK, points, 2)
            pygame.draw.polygon(screen, BLACK, [
                (x + PIECE_SIZE//2, y + 4),
                (x + PIECE_SIZE - 4, y + PIECE_SIZE//2),
                (x + PIECE_SIZE//2, y + PIECE_SIZE - 4),
                (x + 4, y + PIECE_SIZE//2)
            ], 2)
            if self.selected:  # 如果被选中，添加高亮效果
                glow_points = [
                    (x + PIECE_SIZE//2, y - 2),
                    (x + PIECE_SIZE + 2, y + PIECE_SIZE//2),
                    (x + PIECE_SIZE//2, y + PIECE_SIZE + 2),
                    (x - 2, y + PIECE_SIZE//2)
                ]
                pygame.draw.polygon(screen, (255, 255, 0), glow_points, 2)
        else:
            # 普通棋子仍然是圆形
            pygame.draw.circle(screen, self.color, (x + PIECE_SIZE//2, y + PIECE_SIZE//2), PIECE_SIZE//2)
            pygame.draw.circle(screen, BLACK, (x + PIECE_SIZE//2, y + PIECE_SIZE//2), PIECE_SIZE//2, 2)
            if self.selected:  # 如果被选中，添加高亮效果
                pygame.draw.circle(screen, (255, 255, 0), 
                                (x + PIECE_SIZE//2, y + PIECE_SIZE//2), 
                                PIECE_SIZE//2 + 2, 2)

class PlayerBoard:
    def __init__(self, x: int, y: int, player_name: str):
        self.x = x
        self.y = y
        self.player_name = player_name
        self.prep_area = [[None for _ in range(i)] for i in range(1, 6)]
        self.scoring_area = [[None for _ in range(5)] for _ in range(5)]
        self.penalty_area = [None] * 7
        self.penalty_values = [-1, -1, -2, -2, -2, -3, -3]
        self.score = 0
        
        # 初始化结算区的颜色模式
        self.scoring_colors = [
            [BLUE, YELLOW, RED, BLACK, WHITE],      # 第1排
            [WHITE, BLUE, YELLOW, RED, BLACK],      # 第2排
            [BLACK, WHITE, BLUE, YELLOW, RED],      # 第3排
            [RED, BLACK, WHITE, BLUE, YELLOW],      # 第4排
            [YELLOW, RED, BLACK, WHITE, BLUE]       # 第5排
        ]
        
    def draw(self, screen: pygame.Surface):
        # 绘制玩家名字和分数
        font = pygame.font.Font(None, 36)
        name_text = font.render(f"{self.player_name} - Score: {self.score}", True, BLACK)
        screen.blit(name_text, (self.x, self.y - 30))
        
        # 绘制准备区 - 修改为右对齐
        prep_width = 5 * PIECE_SIZE  # 最长一行的宽度
        for row in range(5):
            row_length = row + 1
            for col in range(row_length):
                # 计算右对齐的x坐标
                x = self.x + prep_width - (row_length - col) * PIECE_SIZE
                y = self.y + row * PIECE_SIZE
                pygame.draw.rect(screen, GRAY, (x, y, PIECE_SIZE, PIECE_SIZE), 1)
                if self.prep_area[row][col]:
                    self.prep_area[row][col].draw(screen, x, y)
        
        # 绘制结算区
        for row in range(5):
            for col in range(5):
                x = self.x + 200 + col * PIECE_SIZE
                y = self.y + row * PIECE_SIZE
                # 绘制底色
                pygame.draw.rect(screen, self.scoring_colors[row][col], 
                               (x, y, PIECE_SIZE, PIECE_SIZE))
                # 绘制边框
                pygame.draw.rect(screen, GRAY, 
                               (x, y, PIECE_SIZE, PIECE_SIZE), 1)
                if self.scoring_area[row][col]:
                    self.scoring_area[row][col].draw(screen, x, y)
        
        # 绘制扣分区及其分数
        small_font = pygame.font.Font(None, 24)
        for i in range(7):
            x = self.x + i * PIECE_SIZE
            y = self.y + 200
            # 绘制扣分值
            penalty_text = small_font.render(str(self.penalty_values[i]), True, BLACK)
            text_rect = penalty_text.get_rect(centerx=x + PIECE_SIZE//2, bottom=y - 2)
            screen.blit(penalty_text, text_rect)
            # 绘制格子和棋子
            pygame.draw.rect(screen, GRAY, (x, y, PIECE_SIZE, PIECE_SIZE), 1)
            if self.penalty_area[i]:
                self.penalty_area[i].draw(screen, x, y)

    def get_prep_area_position(self, pos) -> Tuple[int, int]:
        """获取点击的准备区位置"""
        prep_width = 5 * PIECE_SIZE
        for row in range(5):
            row_length = row + 1
            for col in range(row_length):
                x = self.x + prep_width - (row_length - col) * PIECE_SIZE
                y = self.y + row * PIECE_SIZE
                rect = pygame.Rect(x, y, PIECE_SIZE, PIECE_SIZE)
                if rect.collidepoint(pos):
                    return row, col
        return -1, -1

    def can_place_pieces(self, row: int, color: Tuple[int, int, int]) -> bool:
        """检查是否可以在指定行放置指定颜色的棋子"""
        # 检查这一行是否已经有其他颜色的棋子
        for piece in self.prep_area[row]:
            if piece and piece.color != color:
                return False
                
        # 检查结算区该行是否已经有这个颜色
        for piece in self.scoring_area[row]:
            if piece and piece.color == color:
                return False
        
        return True

    def place_pieces(self, pieces: List[Piece], row: int) -> List[Piece]:
        """在指定行放置棋子，返回无法放置的棋子"""
        row_length = row + 1
        available_slots = row_length - sum(1 for p in self.prep_area[row] if p)
        
        # 如果棋子数量超过可用空格，返回多余的棋子
        if len(pieces) > available_slots:
            to_place = pieces[:available_slots]
            overflow = pieces[available_slots:]
        else:
            to_place = pieces
            overflow = []
            
        # 从右到左放置棋子
        col = row_length - 1
        for piece in to_place:
            while col >= 0 and self.prep_area[row][col]:
                col -= 1
            if col >= 0:
                self.prep_area[row][col] = piece
                
        return overflow

    def calculate_piece_score(self, row: int, col: int) -> int:
        """计算新放置的棋子的得分"""
        total_score = 0
        piece = self.scoring_area[row][col]
        if not piece:
            return 0
            
        # 检查水平方向
        horizontal_line = [piece]
        # 向左检查
        for c in range(col - 1, -1, -1):
            if self.scoring_area[row][c]:
                horizontal_line.insert(0, self.scoring_area[row][c])
            else:
                break
        # 向右检查
        for c in range(col + 1, 5):
            if self.scoring_area[row][c]:
                horizontal_line.append(self.scoring_area[row][c])
            else:
                break
                
        # 检查垂直方向
        vertical_line = [piece]
        # 向上检查
        for r in range(row - 1, -1, -1):
            if self.scoring_area[r][col]:
                vertical_line.insert(0, self.scoring_area[r][col])
            else:
                break
        # 向下检查
        for r in range(row + 1, 5):
            if self.scoring_area[r][col]:
                vertical_line.append(self.scoring_area[r][col])
            else:
                break
        
        # 计算分数
        if len(horizontal_line) >= 2:
            total_score += len(horizontal_line)
        if len(vertical_line) >= 2:
            total_score += len(vertical_line)
        if total_score == 0:  # 如果没有形成任何连线
            total_score = 1   # 单个棋子得1分
            
        return total_score

    def score_row(self, row: int) -> List[Tuple[int, int, int]]:
        """结算一行，返回需要计分的位置和分数"""
        if not all(piece for piece in self.prep_area[row]):  # 如果这一行没满
            return []
            
        score_positions = []  # [(row, col, score), ...]
        # 找到对应颜色的位置
        for piece in self.prep_area[row]:
            target_col = None
            for i in range(5):
                if self.scoring_colors[row][i] == piece.color:
                    target_col = i
                    break
            if target_col is not None:
                # 先放置棋子
                self.scoring_area[row][target_col] = piece
                # 计算这颗棋子的得分
                score = self.calculate_piece_score(row, target_col)
                if score > 0:
                    score_positions.append((row, target_col, score))
        
        # 清空准备区这一行
        self.prep_area[row] = [None] * len(self.prep_area[row])
        return score_positions

    def has_complete_row(self) -> bool:
        """检查是否有完整的一行"""
        for row in range(5):
            if all(self.scoring_area[row]):  # 如果这一行的所有位置都有棋子
                return True
        return False

class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("方砖游戏")
        
        self.piece_pool = []
        self.waste_pool = []
        self.waiting_area = []
        self.first_piece = None
        self.disks = [[] for _ in range(5)]
        
        self.player1_board = PlayerBoard(50, 50, "Player 1")
        self.player2_board = PlayerBoard(50, 400, "Player 2")
        
        self.current_player = random.randint(1, 2)  # 随机选择第一回合的先手玩家
        self.selected_pieces = []  # 存储当前选中的棋子
        self.game_phase = "SELECT"  # SELECT: 选择棋子, PLACE: 放置棋子
        
        self.selected_disk_index = -1  # 记录选中的圆盘索引
        self.selected_color = None     # 记录选中的颜色
        
        self.first_player_decided = False  # 添加标记，记录是否已经确定了先手玩家
        
        self.animation_timer = 0  # 用于控制动画时间
        self.score_animations = []  # 存储分数动画信息
        
        self.initialize_pieces()
        
        # 修改按钮位置到圆盘下方
        button_y = 300  # 圆盘下方的位置
        self.start_button = Button(600, button_y, 150, 40, "Start Game")
        self.restart_button = Button(770, button_y, 150, 40, "Restart")
        
        # 添加游戏状态
        self.state = GameState.INIT
        
        # 创建独立的先手棋子（使用固定颜色）
        self.first_piece = Piece(BLUE, is_first=True)
        
    def initialize_pieces(self):
        """初始化棋子池 - 每种颜色20个棋子"""
        self.piece_pool = []
        colors = [BLUE, YELLOW, RED, BLACK, WHITE]
        for color in colors:
            for _ in range(20):  # 每种颜色20个
                self.piece_pool.append(Piece(color))
        random.shuffle(self.piece_pool)
        
    def start_new_round(self):
        """开始新回合"""
        # 将先手棋子放入待定区
        self.waiting_area.append(self.first_piece)
        
        # 清空所有圆盘
        for disk in self.disks:
            disk.clear()
        
        # 检查棋子池是否完全空了
        if not self.piece_pool:
            self.piece_pool.extend(self.waste_pool)
            self.waste_pool.clear()
            random.shuffle(self.piece_pool)
        
        # 分配棋子到圆盘（有多少放多少）
        for disk in self.disks:
            for _ in range(4):  # 尝试在每个圆盘放4个
                if self.piece_pool:  # 只在还有棋子时继续放置
                    disk.append(self.piece_pool.pop())
                else:
                    break
        
        # 重置先手玩家决定状态
        self.first_player_decided = False
        
    def get_disk_pieces(self, pos) -> Tuple[List[Piece], int]:
        """获取点击位置所在圆盘的所有同色棋子"""
        for i, disk in enumerate(self.disks):
            disk_x = 600 + (i % 3) * (DISK_SIZE + 20)
            disk_y = 100 + (i // 3) * (DISK_SIZE + 20)
            disk_rect = pygame.Rect(disk_x, disk_y, DISK_SIZE, DISK_SIZE)
            
            if disk_rect.collidepoint(pos):
                # 找到被点击的棋子
                for piece in disk:
                    piece_x = disk_x + (disk.index(piece) % 2) * PIECE_SIZE
                    piece_y = disk_y + (disk.index(piece) // 2) * PIECE_SIZE
                    if piece.rect.collidepoint(pos):
                        # 返回该圆盘中所有相同颜色的棋子
                        same_color_pieces = [p for p in disk if p.color == piece.color]
                        return same_color_pieces, i
        return [], -1

    def get_waiting_area_pieces(self, pos) -> List[Piece]:
        """获取点击位置所在待定区的所有同色棋子"""
        waiting_x = 950
        current_y = 100
        
        # 先手棋子不能被直接选择
        if self.first_piece in self.waiting_area:
            current_y += PIECE_SIZE  # 跳过先手棋子的位置
        
        # 检查其他棋子
        colors = {piece.color for piece in self.waiting_area if not piece.is_first}
        for color in colors:
            same_color_pieces = [p for p in self.waiting_area if p.color == color and not p.is_first]
            for piece in same_color_pieces:
                piece_rect = pygame.Rect(waiting_x, current_y, PIECE_SIZE, PIECE_SIZE)
                if piece_rect.collidepoint(pos):
                    return same_color_pieces
                current_y += PIECE_SIZE
            if same_color_pieces:
                current_y += 5
                
        return []

    def draw_score_animations(self):
        """绘制分数动画"""
        current_time = pygame.time.get_ticks()
        font = pygame.font.Font(None, 36)
        
        # 绘制所有活跃的分数动画
        for anim in self.score_animations[:]:
            if current_time - anim['start_time'] < 1000:  # 显示1秒
                score_text = font.render(f"+{anim['score']}", True, (0, 255, 0))
                self.screen.blit(score_text, (anim['x'], anim['y']))
            else:
                self.score_animations.remove(anim)
    
    def draw(self):
        self.screen.fill(BACKGROUND)
        
        # 绘制玩家板
        self.player1_board.draw(self.screen)
        self.player2_board.draw(self.screen)
        
        # 绘制圆盘
        for i, disk in enumerate(self.disks):
            x = 600 + (i % 3) * (DISK_SIZE + 20)
            y = 100 + (i // 3) * (DISK_SIZE + 20)
            pygame.draw.circle(self.screen, GRAY, (x + DISK_SIZE//2, y + DISK_SIZE//2), DISK_SIZE//2, 2)
            
            for j, piece in enumerate(disk):
                piece_x = x + (j % 2) * PIECE_SIZE
                piece_y = y + (j // 2) * PIECE_SIZE
                piece.draw(self.screen, piece_x, piece_y)
        
        # 修改待定区的绘制，按颜色分组
        waiting_x = 950
        colors = {piece.color for piece in self.waiting_area}  # 获取所有不同的颜色
        current_y = 100  # 从圆盘的高度开始显示
        
        # 先绘制先手棋子（如果在待定区）
        if self.first_piece in self.waiting_area:
            self.first_piece.draw(self.screen, waiting_x, current_y)
            current_y += PIECE_SIZE
        
        # 按颜色分组绘制其他棋子
        for color in colors:
            same_color_pieces = [p for p in self.waiting_area if p.color == color and not p.is_first]
            for piece in same_color_pieces:
                piece.draw(self.screen, waiting_x, current_y)
                current_y += PIECE_SIZE
            # 不同颜色之间留一点间隔
            if same_color_pieces:
                current_y += 5
        
        # 绘制按钮和当前玩家信息
        self.start_button.enabled = (self.state == GameState.INIT)
        self.restart_button.enabled = (self.state != GameState.INIT)
        self.start_button.draw(self.screen)
        self.restart_button.draw(self.screen)
        
        # 显示当前玩家 - 移动到按钮旁边
        if self.state == GameState.RUNNING:
            font = pygame.font.Font(None, 36)
            current_player_text = font.render(f"Current Player: Player {self.current_player}", True, BLACK)
            text_rect = current_player_text.get_rect(left=600, centery=360)  # 按钮下方
            self.screen.blit(current_player_text, text_rect)
        
        # 绘制分数动画
        self.draw_score_animations()
        
        pygame.display.flip()
    
    def clear_selection(self):
        """清除所有选择状态"""
        # 清除圆盘中棋子的选中状态
        for disk in self.disks:
            for piece in disk:
                piece.selected = False
        # 清除待定区棋子的选中状态
        for piece in self.waiting_area:
            piece.selected = False
        self.selected_disk_index = -1
        self.selected_color = None
        
    def is_valid_board_area(self, pos, current_player) -> bool:
        """检查点击位置是否在当前玩家的有效区域内"""
        board = self.player1_board if current_player == 1 else self.player2_board
        
        # 检查是否在准备区范围内
        prep_width = 5 * PIECE_SIZE
        prep_height = 5 * PIECE_SIZE
        prep_rect = pygame.Rect(board.x, board.y, prep_width, prep_height)
        
        # 检查是否在扣分区范围内
        penalty_width = 7 * PIECE_SIZE
        penalty_rect = pygame.Rect(board.x, board.y + 200, penalty_width, PIECE_SIZE)
        
        return prep_rect.collidepoint(pos) or penalty_rect.collidepoint(pos)

    def check_game_end(self) -> bool:
        """检查游戏是否结束"""
        return (self.player1_board.has_complete_row() or 
                self.player2_board.has_complete_row())
    
    def show_game_result(self):
        """显示游戏结果"""
        # 确定获胜者
        winner = None
        if self.player1_board.score > self.player2_board.score:
            winner = "Player 1"
        elif self.player2_board.score > self.player1_board.score:
            winner = "Player 2"
        
        # 显示结果
        font = pygame.font.Font(None, 48)
        if winner:
            text = f"{winner} Wins!"
        else:
            text = "Game Draw!"
        text_surface = font.render(text, True, BLACK)
        text_rect = text_surface.get_rect(center=(WINDOW_WIDTH//2, WINDOW_HEIGHT//2))
        
        # 显示分数
        score_font = pygame.font.Font(None, 36)
        score1_text = f"Player 1: {self.player1_board.score}"
        score2_text = f"Player 2: {self.player2_board.score}"
        score1_surface = score_font.render(score1_text, True, BLACK)
        score2_surface = score_font.render(score2_text, True, BLACK)
        score1_rect = score1_surface.get_rect(centerx=WINDOW_WIDTH//2, 
                                            top=text_rect.bottom + 20)
        score2_rect = score2_surface.get_rect(centerx=WINDOW_WIDTH//2, 
                                            top=score1_rect.bottom + 10)
        
        # 绘制结果
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.fill((255, 255, 255))
        overlay.set_alpha(200)
        self.screen.blit(overlay, (0, 0))
        self.screen.blit(text_surface, text_rect)
        self.screen.blit(score1_surface, score1_rect)
        self.screen.blit(score2_surface, score2_rect)
        pygame.display.flip()
        
        # 等待点击继续
        waiting = True
        while waiting:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    return
                if event.type == pygame.MOUSEBUTTONDOWN:
                    waiting = False
        
        # 重新开始游戏
        self.__init__()

    def calculate_scores(self):
        """计算所有分数并进入下一回合"""
        self.state = GameState.SCORING
        
        for board in [self.player1_board, self.player2_board]:
            # 结算准备区，一行一行处理
            for row in range(5):
                score_positions = board.score_row(row)
                # 显示每个位置的得分动画
                for row_pos, col_pos, score in score_positions:
                    self.score_animations.append({
                        'score': score,
                        'x': board.x + 200 + col_pos * PIECE_SIZE,
                        'y': board.y + row_pos * PIECE_SIZE,
                        'start_time': pygame.time.get_ticks()
                    })
                    board.score += score
                    
                    # 等待动画显示
                    start_time = pygame.time.get_ticks()
                    while pygame.time.get_ticks() - start_time < 500:
                        self.draw()
                        pygame.event.pump()
            
            # 计算扣分区的分数并移入废棋堆
            for i, piece in enumerate(board.penalty_area):
                if piece:
                    penalty_score = board.penalty_values[i]
                    self.score_animations.append({
                        'score': penalty_score,
                        'x': board.x + i * PIECE_SIZE,
                        'y': board.y + 200,
                        'start_time': pygame.time.get_ticks()
                    })
                    board.score += penalty_score
                    self.waste_pool.append(piece)
                    board.penalty_area[i] = None
                    
                    # 等待动画显示
                    start_time = pygame.time.get_ticks()
                    while pygame.time.get_ticks() - start_time < 300:
                        self.draw()
                        pygame.event.pump()
            
            # 等待所有动画完成
            while self.score_animations:
                self.draw()
                pygame.event.pump()
        
        # 在结算完成后检查游戏是否结束
        if self.check_game_end():
            self.state = GameState.END
            self.show_game_result()
        else:
            # 继续游戏
            self.state = GameState.RUNNING
            self.start_new_round()
        
    def handle_click(self, pos):
        """处理鼠标点击事件"""
        if self.start_button.is_clicked(pos):
            self.state = GameState.RUNNING
            self.start_new_round()
            return
            
        if self.restart_button.is_clicked(pos):
            self.__init__()
            return
            
        if self.state != GameState.RUNNING:
            return
            
        current_board = self.player1_board if self.current_player == 1 else self.player2_board
        
        # 如果已经选中了棋子，处理放置逻辑
        if self.selected_color:
            # 检查是否点击了当前玩家的有效区域
            if not self.is_valid_board_area(pos, self.current_player):
                return  # 无效点击，直接返回
            
            # 获取选中的棋子
            selected_pieces = []
            if self.selected_disk_index != -1:
                disk = self.disks[self.selected_disk_index]
                selected_pieces = [p for p in disk if p.color == self.selected_color]
            else:
                selected_pieces = [p for p in self.waiting_area if p.color == self.selected_color and not p.is_first]
            
            if not selected_pieces:
                return
            
            # 检查是否是第一次从待定区选择并放置棋子
            is_first_waiting_area_placement = (
                not self.first_player_decided and 
                self.first_piece in self.waiting_area and 
                self.selected_disk_index == -1
            )
            
            # 获取点击位置
            row, col = current_board.get_prep_area_position(pos)
            penalty_area_clicked = (
                current_board.x <= pos[0] <= current_board.x + 7 * PIECE_SIZE and
                current_board.y + 200 <= pos[1] <= current_board.y + 200 + PIECE_SIZE
            )
            
            # 处理放置
            placement_successful = False
            
            if penalty_area_clicked:
                # 直接放入扣分区
                for piece in selected_pieces:
                    for j in range(7):
                        if not current_board.penalty_area[j]:
                            current_board.penalty_area[j] = piece
                            break
                placement_successful = True
                
            elif row != -1 and current_board.can_place_pieces(row, self.selected_color):
                # 放入准备区
                overflow_pieces = current_board.place_pieces(selected_pieces, row)
                # 处理溢出的棋子
                for piece in overflow_pieces:
                    for j in range(7):
                        if not current_board.penalty_area[j]:
                            current_board.penalty_area[j] = piece
                            break
                placement_successful = True
            
            if placement_successful:
                # 从原位置移除棋子
                if self.selected_disk_index != -1:
                    disk = self.disks[self.selected_disk_index]
                    # 将剩余棋子移到待定区
                    remaining_pieces = [p for p in disk if p.color != self.selected_color]
                    self.waiting_area.extend(remaining_pieces)
                    self.disks[self.selected_disk_index].clear()
                else:
                    self.waiting_area = [p for p in self.waiting_area if p.color != self.selected_color or p.is_first]
                
                # 处理先手棋子
                if is_first_waiting_area_placement:
                    self.first_player_decided = True
                    for j in range(7):
                        if not current_board.penalty_area[j]:
                            current_board.penalty_area[j] = self.first_piece
                            self.waiting_area.remove(self.first_piece)
                            break
                
                # 检查是否需要结算
                if not self.waiting_area and all(not disk for disk in self.disks):
                    self.state = GameState.SCORING
                    self.calculate_scores()
                else:
                    self.current_player = 3 - self.current_player
            
            # 清除选择状态
            self.clear_selection()
            return
        
        # 尝试选择新的棋子
        # 从圆盘选择
        pieces, disk_index = self.get_disk_pieces(pos)
        if pieces:
            self.clear_selection()
            self.selected_disk_index = disk_index
            self.selected_color = pieces[0].color
            for piece in pieces:
                piece.selected = True
            return
        
        # 从待定区选择
        pieces = self.get_waiting_area_pieces(pos)
        if pieces:
            self.clear_selection()
            self.selected_color = pieces[0].color
            for piece in pieces:
                piece.selected = True
            return
    
    def run(self):
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    
                if event.type == pygame.MOUSEBUTTONDOWN:
                    self.handle_click(event.pos)
                    
            self.draw()
            
        pygame.quit()

if __name__ == "__main__":
    game = Game()
    game.run() 