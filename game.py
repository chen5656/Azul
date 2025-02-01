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

class Piece:
    def __init__(self, color: Tuple[int, int, int]):
        self.color = color
        self.rect = pygame.Rect(0, 0, PIECE_SIZE, PIECE_SIZE)
        
    def draw(self, screen: pygame.Surface, x: int, y: int):
        self.rect.x = x
        self.rect.y = y
        pygame.draw.circle(screen, self.color, (x + PIECE_SIZE//2, y + PIECE_SIZE//2), PIECE_SIZE//2)
        pygame.draw.circle(screen, BLACK, (x + PIECE_SIZE//2, y + PIECE_SIZE//2), PIECE_SIZE//2, 2)

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
        
        self.current_player = 1
        self.initialize_pieces()
        
    def initialize_pieces(self):
        colors = [BLUE, YELLOW, RED, BLACK, WHITE]
        for color in colors:
            for _ in range(20):
                self.piece_pool.append(Piece(color))
        random.shuffle(self.piece_pool)
        
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
        
        # 绘制待定区
        for i, piece in enumerate(self.waiting_area):
            x = 800
            y = 300 + i * PIECE_SIZE
            piece.draw(self.screen, x, y)
            
        pygame.display.flip()
        
    def run(self):
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    
                if event.type == pygame.MOUSEBUTTONDOWN:
                    # 处理鼠标点击事件
                    pass
                    
            self.draw()
            
        pygame.quit()

if __name__ == "__main__":
    game = Game()
    game.run() 