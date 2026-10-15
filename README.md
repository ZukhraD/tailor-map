# Tailor Map

Подбор стиля одежды по фигуре: анкета с замерами и предпочтениями → тип телосложения, размеры (включая джинсы Zara и Mango), подходящий крой, готовые образы с примеркой на фигуре и форма отзывов.

## Структура

```
index.html        — весь сайт (HTML, стили и логика в одном файле)
api/feedback.js   — приём отзывов и пересылка в Telegram (Vercel Serverless Function)
package.json
```

Сборка не нужна: Vercel отдаёт `index.html` как статику, а `api/feedback.js` запускает как функцию.

## 1. Загрузить на GitHub

**Через сайт (без командной строки):**
1. На github.com нажмите **New repository**, назовите `tailor-map`, создайте пустой репозиторий.
2. На странице репозитория нажмите **uploading an existing file**.
3. Перетащите все файлы и папку `api` из архива, нажмите **Commit changes**.

**Через git:**
```bash
cd tailor-map
git init
git add .
git commit -m "Tailor Map"
git branch -M main
git remote add origin https://github.com/<ваш-логин>/tailor-map.git
git push -u origin main
```

## 2. Опубликовать на Vercel

1. Зайдите на vercel.com через GitHub.
2. **Add New → Project**, выберите репозиторий `tailor-map`, нажмите **Import**.
3. Framework Preset: **Other**. Остальное оставьте по умолчанию и нажмите **Deploy**.
4. Через минуту получите ссылку вида `https://tailor-map.vercel.app`.

Каждый новый коммит в `main` будет обновлять сайт автоматически.

## 3. Отзывы в Telegram (по желанию)

1. В Telegram напишите **@BotFather** → `/newbot` → получите токен бота.
2. Напишите своему новому боту любое сообщение.
3. Узнайте свой chat id: например, напишите **@userinfobot**, он пришлёт ваш Id.
4. В Vercel: **Project → Settings → Environment Variables** добавьте:
   - `TELEGRAM_BOT_TOKEN` — токен от BotFather
   - `TELEGRAM_CHAT_ID` — ваш id
5. **Deployments → … → Redeploy**, чтобы переменные подхватились.

Теперь каждый отзыв с сайта приходит вам сообщением в Telegram. Если переменные не заданы, форма покажет тестировщику готовый текст отзыва с кнопкой «Скопировать».

## Что хранится и где

- Профили, которые человек сохраняет на сайте, остаются только в его браузере (localStorage).
- На сервер уходит только то, что человек сам отправил через форму отзыва. Замеры прикладываются, только если отмечена соответствующая галочка.
- Токен бота хранится в переменных окружения Vercel и в коде не встречается.
