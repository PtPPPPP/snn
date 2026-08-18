from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

INK = (17, 17, 15)
PAPER = (244, 241, 232)
LIME = (200, 255, 0)
BLUE = (36, 71, 255)
MUTED = (169, 166, 156)

# 背景
bg = Image.new("RGB", (W, H), INK)

# 网格
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for x in range(0, W, 64):
    gd.line([(x, 0), (x, H)], fill=(36, 71, 255, 22), width=1)
for y in range(0, H, 64):
    gd.line([(0, y), (W, y)], fill=(36, 71, 255, 22), width=1)
bg = Image.alpha_composite(bg.convert("RGBA"), grid).convert("RGB")

draw = ImageDraw.Draw(bg)

FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_REG = "C:/Windows/Fonts/msyh.ttc"

f_coord = ImageFont.truetype(FONT_REG, 24)
f_brand = ImageFont.truetype(FONT_BOLD, 230)
f_sub = ImageFont.truetype(FONT_REG, 40)
f_zh = ImageFont.truetype(FONT_REG, 44)
f_small = ImageFont.truetype(FONT_REG, 26)

# 左上角坐标
draw.text((84, 70), "X:064 / Y:108", font=f_coord, fill=BLUE)

# 主标题
draw.text((78, 120), "SNN", font=f_brand, fill=PAPER)

# 英文副标题（带字母间距）
sub = "SMART NEURAL NETWORK"
x = 84
for ch in sub:
    draw.text((x, 372), ch, font=f_sub, fill=PAPER)
    x += draw.textlength(ch, font=f_sub) + 6

# lime 副标题
draw.text((84, 442), "AI x ROBOTICS x MAKERS", font=f_sub, fill=LIME)

# 中文 tagline
draw.text((84, 512), "把想法，训练成现实。", font=f_zh, fill=PAPER)

# 右下角装饰：蓝色描边方块 + lime 实心方块
draw.rectangle([952, 448, 1140, 588], outline=BLUE, width=3)
draw.rectangle([904, 400, 1032, 478], fill=LIME)

# 底部信息条
draw.line([(84, 570), (1116, 570)], fill=(244, 241, 232, 60), width=1)
draw.text((84, 582), "PROJECT-DRIVEN", font=f_small, fill=MUTED)
draw.text((340, 582), "OPEN TO BEGINNERS", font=f_small, fill=MUTED)
draw.text((620, 582), "BUILD IN PUBLIC", font=f_small, fill=MUTED)

bg.save("public/assets/og.png", "PNG")
print("saved public/assets/og.png", bg.size)
