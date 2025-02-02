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
        self.text = text  # 改为普通属性而不是只读
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
        
        total_score = 0
        has_line = False
        
        # 计算水平连线分数（长度≥2才计分）
        if len(horizontal_line) >= 2:
            total_score += len(horizontal_line)
            has_line = True
            
        # 计算垂直连线分数（长度≥2才计分）
        if len(vertical_line) >= 2:
            total_score += len(vertical_line)
            has_line = True
            
        # 只有在没有形成任何连线时才得1分
        if not has_line:
            total_score = 1
            
        return total_score

    def score_row(self, row: int) -> List[Tuple[int, int, int]]:
        """结算一行，返回需要计分的位置和分数"""
        if not all(piece for piece in self.prep_area[row]):  # 如果这一行没满
            return []  # 未填满的行保持原状
        
        # 先记录所有要移动的棋子和位置
        target_col = None
        target_piece = None
        for piece in self.prep_area[row]:
            for i in range(5):
                if self.scoring_colors[row][i] == piece.color:
                    target_col = i
                    target_piece = piece
                    break
            if target_piece:
                break
        
        if target_col is not None and target_piece:
            # 将一颗棋子移到结算区
            self.scoring_area[row][target_col] = target_piece
            
            # 记录需要移入废棋堆的棋子
            waste_pieces = []
            for piece in self.prep_area[row]:
                if piece != target_piece:  # 除了移到结算区的那颗棋子
                    waste_pieces.append(piece)
            
            # 计算分数
            score_positions = self.calculate_line_scores(row, [(target_piece, target_col)])
            
            # 清空准备区这一行
            self.prep_area[row] = [None] * len(self.prep_area[row])
            
            # 返回分数位置和需要移入废棋堆的棋子
            return score_positions, waste_pieces
        
        return [], []

    def has_complete_row(self) -> bool:
        """检查是否有完整的一行"""
        for row in range(5):
            if all(self.scoring_area[row]):  # 如果这一行的所有位置都有棋子
                return True
        return False

    def calculate_line_scores(self, row: int, moves: List[Tuple[Piece, int]]) -> List[Tuple[int, int, int]]:
        """
        计算新放置的棋子形成的连线得分
        
        参数:
            row (int): 当前处理的行号（0-4）
            moves (List[Tuple[Piece, int]]): 新放置的棋子列表，每个元素是(棋子, 目标列)的元组
        
        返回:
            List[Tuple[int, int, int]]: 得分列表，每个元素是(行号, 列号, 分数)的元组
        """
        score_positions = []  # 最终的得分列表
        scored_positions = set()  # 记录已经计算过分数的位置
        
        # 对每个新放置的棋子
        for _, col in moves:
            # 如果这个位置已经计算过分数，跳过
            if (row, col) in scored_positions:
                continue
            
            # 检查水平连线
            horizontal_line = []
            for c in range(5):
                if self.scoring_area[row][c]:
                    horizontal_line.append(c)
            
            # 检查垂直连线
            vertical_line = []
            for r in range(5):
                if self.scoring_area[r][col]:
                    vertical_line.append(r)
            
            # 计算分数
            score = 0
            has_line = False
            
            # 如果形成水平连线（长度≥2）
            if len(horizontal_line) >= 2 and col in horizontal_line:
                score += len(horizontal_line)
                has_line = True
            
            # 如果形成垂直连线（长度≥2）
            if len(vertical_line) >= 2:
                score += len(vertical_line)
                has_line = True
            
            # 如果没有形成任何连线，得1分
            if not has_line:
                score = 1
            
            # 记录这个位置已经计算过分数
            scored_positions.add((row, col))
            score_positions.append((row, col, score))
        
        return score_positions

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
        
        self.current_player = 1  # 第一回合固定Player 1先手
        self.selected_pieces = []  # 存储当前选中的棋子
        self.game_phase = "SELECT"  # SELECT: 选择棋子, PLACE: 放置棋子
        
        self.selected_disk_index = -1  # 记录选中的圆盘索引
        self.selected_color = None     # 记录选中的颜色
        
        self.first_player_decided = False  # 添加标记，记录是否已经确定了先手玩家
        
        self.animation_timer = 0  # 用于控制动画时间
        self.score_animations = []  # 存储分数动画信息
        
        self.round_count = 0  # 改为从0开始，这样第一回合会变成1
        
        self.initialize_pieces()
        
        # 只保留一个按钮，初始显示为"Start Game"
        self.game_button = Button(600, 300, 150, 40, "Start Game")
        
        # 添加游戏状态
        self.state = GameState.INIT
        
        # 创建独立的先手棋子（使用灰色）
        self.first_piece = Piece(GRAY, is_first=True)
        
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
        if self.first_piece not in self.waiting_area:
            self.waiting_area.append(self.first_piece)
        
        # 清空所有圆盘
        for disk in self.disks:
            disk.clear()
        
        # 检查棋子池是否完全空了
        if not self.piece_pool:
            self.show_error_message("Using pieces from waste pool!")
            pygame.time.wait(1000)
            self.piece_pool.extend(self.waste_pool)
            self.waste_pool.clear()
            random.shuffle(self.piece_pool)
        
        # 分配棋子到圆盘
        for disk in self.disks:
            for _ in range(4):
                if self.piece_pool:
                    disk.append(self.piece_pool.pop())
                else:
                    break
        
        self.first_player_decided = False
        self.round_count += 1  # 增加回合数
        
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
        
        for anim in self.score_animations[:]:
            if current_time - anim['start_time'] < 1000:  # 显示1秒
                # 计算动画效果
                age = current_time - anim['start_time']
                alpha = 255 * (1 - age / 1000)  # 逐渐消失
                y_offset = -20 * (age / 1000)  # 向上飘动
                
                # 创建文本
                if anim['score'] > 0:
                    text = f"+{anim['score']}"
                    color = (0, 255, 0)  # 绿色表示得分
                else:
                    text = str(anim['score'])
                    color = (255, 0, 0)  # 红色表示扣分
                
                # 渲染文本
                text_surface = font.render(text, True, color)
                text_surface.set_alpha(int(alpha))
                
                # 计算位置
                x = anim['x']
                y = anim['y'] + y_offset
                
                self.screen.blit(text_surface, (x, y))
            else:
                self.score_animations.remove(anim)
    
    def draw_hints(self):
        """绘制操作提示"""
        if self.state != GameState.RUNNING:
            return
            
        font = pygame.font.Font(None, 24)
        hints = []
        
        if not self.selected_color:
            hints.append("Click on disk or waiting area to select pieces")
        else:
            hints.append("Click on preparation area to place pieces")
            hints.append("Click on penalty area to discard pieces")
            
        y = 400  # 提示文字的起始y坐标
        for hint in hints:
            text_surface = font.render(hint, True, BLACK)
            text_rect = text_surface.get_rect(left=600, top=y)
            self.screen.blit(text_surface, text_rect)
            y += 25
            
    def draw_game_info(self):
        """绘制游戏信息"""
        info_font = pygame.font.Font(None, 36)
        small_font = pygame.font.Font(None, 24)
        
        # 在屏幕右侧显示游戏信息
        y = 450
        spacing = 30
        
        # 显示回合数
        if self.state == GameState.INIT:
            text = info_font.render("Round:", True, BLACK)  # 游戏开始前只显示"Round:"
        else:
            text = info_font.render(f"Round: {self.round_count}", True, BLACK)  # 游戏开始后显示具体回合数
        self.screen.blit(text, (600, y))
        y += spacing
        
        # 显示棋子池和废棋堆信息
        pool_text = info_font.render(f"Pieces in Pool: {len(self.piece_pool)}", True, BLACK)
        waste_text = info_font.render(f"Pieces in Waste: {len(self.waste_pool)}", True, BLACK)
        self.screen.blit(pool_text, (600, y))
        y += spacing
        self.screen.blit(waste_text, (600, y))
        y += spacing
        
        # 显示当前玩家
        if self.state == GameState.RUNNING:
            text = info_font.render(f"Current: Player {self.current_player}", True, BLACK)
            self.screen.blit(text, (600, y))
            y += spacing
        
        # 显示操作提示
        if self.state == GameState.RUNNING:
            if not self.selected_color:
                hint = "Click on disk or waiting area to select pieces"
            else:
                hint = "Click on your board to place pieces"
            text = small_font.render(hint, True, BLACK)
            self.screen.blit(text, (600, y))

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
        
        # 根据游戏状态更新按钮文本和状态
        if self.state == GameState.INIT:
            self.game_button.text = "Start Game"
        else:
            self.game_button.text = "Restart"
        self.game_button.enabled = True  # 按钮始终可用
        self.game_button.draw(self.screen)
        
        # 添加游戏状态提示
        self.draw_game_info()
        
        # 绘制分数动画
        self.draw_score_animations()
        
        # 添加提示的绘制
        self.draw_hints()
        
        # 添加错误消息的绘制
        self.draw_error_message()
        
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
        # 游戏结束条件：任意玩家的结算区有一整行都有棋子
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
        
        # 添加更多游戏统计信息
        stats_font = pygame.font.Font(None, 24)
        stats_texts = [
            f"Total Rounds: {self.round_count}",
            f"Player 1 Penalties: {sum(1 for p in self.player1_board.penalty_area if p)}",
            f"Player 2 Penalties: {sum(1 for p in self.player2_board.penalty_area if p)}",
            f"Remaining Pieces: {len(self.piece_pool)}",
            "Click anywhere to start new game"
        ]
        
        y = score2_rect.bottom + 20
        for text in stats_texts:
            text_surface = stats_font.render(text, True, BLACK)
            text_rect = text_surface.get_rect(centerx=WINDOW_WIDTH//2, top=y)
            self.screen.blit(text_surface, text_rect)
            y += 25
        
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
        self.state = GameState.SCORING
        game_will_end = False
        
        for board in [self.player1_board, self.player2_board]:
            print(f"\n开始计算 {board.player_name} 的分数")
            self.show_error_message(f"Scoring {board.player_name}'s board...")
            pygame.time.wait(1000)
            
            # 先处理准备区
            for row in range(5):
                if all(piece for piece in board.prep_area[row]):
                    self.show_error_message(f"Processing row {row + 1}")
                    pygame.time.wait(500)
                    
                    score_positions, waste_pieces = board.score_row(row)
                    # 将棋子加入废棋堆
                    self.waste_pool.extend(waste_pieces)
                    
                    for row_pos, col_pos, score in score_positions:
                        # 显示每个位置的得分动画
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
                        
                        # 每放置一个棋子就检查是否有完整的一行
                        if board.has_complete_row():
                            game_will_end = True
                            self.show_error_message(f"{board.player_name} completed a row!")
                            pygame.time.wait(1000)
            
            # 再处理扣分区
            self.show_error_message(f"Processing penalty area")
            pygame.time.wait(500)
            for i, piece in enumerate(board.penalty_area):
                if piece:
                    # 计算扣分
                    penalty_score = board.penalty_values[i]
                    self.score_animations.append({
                        'score': penalty_score,
                        'x': board.x + i * PIECE_SIZE,
                        'y': board.y + 200,
                        'start_time': pygame.time.get_ticks()
                    })
                    board.score += penalty_score
                    
                    # 将棋子移入废棋堆，但先手棋子除外
                    if not piece.is_first:
                        self.waste_pool.append(piece)
                    else:
                        # 先手棋子放回待定区
                        if piece not in self.waiting_area:
                            self.waiting_area.append(piece)
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
        
        # 结算完成后显示废弃堆统计
        print("\n结算后废弃堆统计:")
        self.print_waste_pool_stats()
        
        # 在所有结算完成后再结束游戏
        if game_will_end:
            self.state = GameState.END
            self.show_game_result()
        else:
            self.state = GameState.RUNNING
            self.start_new_round()
        
    def show_error_message(self, message: str):
        """显示错误消息"""
        self.error_message = {
            'text': message,
            'start_time': pygame.time.get_ticks()
        }
        
    def draw_error_message(self):
        """绘制错误消息"""
        if hasattr(self, 'error_message'):
            current_time = pygame.time.get_ticks()
            if current_time - self.error_message['start_time'] < 2000:  # 显示2秒
                font = pygame.font.Font(None, 36)
                text_surface = font.render(self.error_message['text'], True, (255, 0, 0))
                text_rect = text_surface.get_rect(centerx=WINDOW_WIDTH//2, top=10)
                self.screen.blit(text_surface, text_rect)
            else:
                del self.error_message
                
    def handle_click(self, pos):
        """处理鼠标点击事件"""
        if self.game_button.is_clicked(pos):
            if self.state == GameState.INIT:
                self.state = GameState.RUNNING
                self.start_new_round()
            else:
                self.__init__()  # 重新初始化游戏
            return
            
        if self.state != GameState.RUNNING:
            return
            
        current_board = self.player1_board if self.current_player == 1 else self.player2_board
        
        # 尝试选择新的棋子（即使已经选择了其他棋子）
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
        
        # 如果已经选中了棋子，且点击的不是新的棋子，则处理放置逻辑
        if self.selected_color:
            # 检查是否点击了当前玩家的有效区域
            if not self.is_valid_board_area(pos, self.current_player):
                self.show_error_message("Invalid area!")
                return
            
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
                self.selected_disk_index == -1  # 确保是从待定区选的
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
                
            elif row != -1:  # 如果点击了准备区
                if not current_board.can_place_pieces(row, self.selected_color):
                    if any(piece for piece in current_board.prep_area[row] if piece and piece.color != self.selected_color):
                        self.show_error_message("This row already has different color pieces!")
                    elif any(piece for piece in current_board.scoring_area[row] if piece and piece.color == self.selected_color):
                        self.show_error_message("This color already exists in scoring area!")
                    return
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
                if self.selected_disk_index != -1:
                    # 从圆盘选择的情况：剩余棋子移到待定区
                    disk = self.disks[self.selected_disk_index]
                    remaining_pieces = [p for p in disk if p.color != self.selected_color]
                    self.waiting_area.extend(remaining_pieces)
                    self.disks[self.selected_disk_index].clear()
                else:
                    # 从待定区选择的情况
                    # 如果是第一次从待定区选择并成功放置，自动获得先手棋子
                    if not self.first_player_decided and self.first_piece in self.waiting_area:
                        self.first_player_decided = True
                        # 自动将先手棋子放入当前玩家的扣分区
                        for j in range(7):
                            if not current_board.penalty_area[j]:
                                current_board.penalty_area[j] = self.first_piece
                                self.waiting_area.remove(self.first_piece)
                                self.show_error_message(f"{current_board.player_name} got the first player token!")
                                pygame.time.wait(1000)
                                break
                    # 移除选中的棋子
                    self.waiting_area = [p for p in self.waiting_area if p.color != self.selected_color or p.is_first]
                
                # 检查是否需要结算
                if not self.waiting_area and all(not disk for disk in self.disks):
                    self.show_error_message("Round End - Starting Scoring...")
                    pygame.time.wait(1000)  # 给用户一个视觉提示
                    self.state = GameState.SCORING
                    self.calculate_scores()
                else:
                    self.current_player = 3 - self.current_player
            
            # 清除选择状态
            self.clear_selection()
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

    def print_waste_pool_stats(self):
        """打印废弃堆中各颜色棋子的数量统计"""
        print("\n" + "="*50)
        print("废弃堆统计:")
        print("="*50)
        
        # 统计各颜色棋子数量
        color_counts = {}
        for piece in self.waste_pool:
            if piece.is_first:
                color_name = "First Player Token"
            else:
                color_name = {
                    BLUE: "Blue",
                    YELLOW: "Yellow",
                    RED: "Red",
                    BLACK: "Black",
                    WHITE: "White",
                    GRAY: "Gray"
                }.get(piece.color, "Unknown")
            
            color_counts[color_name] = color_counts.get(color_name, 0) + 1
        
        # 打印统计结果
        if not color_counts:
            print("废弃堆为空")
        else:
            print(f"总计: {len(self.waste_pool)} 个棋子")
            print("-"*50)
            for color, count in sorted(color_counts.items()):
                print(f"{color}: {count} 个")
        
        print("="*50 + "\n")

def debug_print_score(row: int, score_positions: List[Tuple[int, int, int]]):
    """漂亮地打印分数信息"""
    print("\n" + "="*50)
    print(f"处理第 {row + 1} 行的得分情况:")
    print("="*50)
    
    if not score_positions:
        print("没有得分位置")
        return
        
    print(f"总共 {len(score_positions)} 个得分位置:")
    for i, (row_pos, col_pos, score) in enumerate(score_positions, 1):
        print(f"位置 {i}:")
        print(f"  - 行: {row_pos + 1}")
        print(f"  - 列: {col_pos + 1}")
        print(f"  - 分数: {score}")
    print("-"*50)
    total_score = sum(score for _, _, score in score_positions)
    print(f"这一行总得分: {total_score}")
    print("="*50 + "\n")

if __name__ == "__main__":
    game = Game()
    game.run() 