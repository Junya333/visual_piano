# キーボードのcを入力するたびにコンソールにマウスカーソル位置の RGB カラーコードを表示するスクリプト

import pyautogui as pg
import keyboard
import pyperclip

while True:
    if keyboard.is_pressed('c'):

        x, y = pg.position()

        rgb_code = f"RGB: {pixel_color}"
        print(rgb_code)
        pyperclip.copy(rgb_code)
        keyboard.wait('c', suppress=True)  # 'c'キーが離されるまで待機して、連続入力を防止

    if keyboard.is_pressed('esc'):
        break  # 'esc'キーが押されたらループを終了
