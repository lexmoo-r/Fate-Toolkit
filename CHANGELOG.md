# 1.50.0-preview.9.10 — корректные колонны навыков Fate Core

- Правило: число навыков на нижней ступени не меньше числа на соседней верхней (нижняя ≥ верхней). Равенство допустимо, фиксированные квоты не нужны.
- Одинаково для ПК и NPC; отдельное разрешение ведущего «Без лестницы (NPC)» сохраняется.
- Проверено на 2/2/2, 1/1/1, равных колоннах NPC, пропусках ступеней и недостающих навыках нижнего ранга.

# 1.50.0-preview.9.9 — свободная форма лестницы навыков

- Убраны фиксированные квоты по рангам: лестница корректна, когда на каждой нижней ступени положительных рангов навыков строго больше, чем на соседней верхней. Промежуточные ступени нельзя пропускать.
- Ограничения рангов (+4 для ПК, +12 для NPC) и бюджет очков ПК сохранены; динамическая диаграмма отражает фактические навыки и пробелы.
- NPC теперь по умолчанию следуют тому же правилу. Ведущий может поставить галочку «Без лестницы (NPC)» для конкретного NPC; выбор сохраняется с его данными и снимает только требование формы лестницы.
- Тесты покрывают нестандартные пирамиды, разрывы, смену флажка, сохранение правила NPC и защиту диапазонов.

# 1.50.0-preview.9.8 — навыки персонажей без переименования и удаления

- В редакторе навыков персонажа названия показываются обычным текстом. Изменяется только ранг; кнопки добавления и удаления убраны.
- Защита сохранения: через поддельные поля нельзя переименовать навык, добавить чужой навык или удалить существующий. Навыки, предоставленные дополнениями, остаются защищёнными.
- В отдельном мастерском редакторе справочника мира сохранено управление названиями и составом навыков.
- Исправлены поиск по неизменяемым названиям, динамическая лестница и двухколоночная компоновка. Обновлены регрессионные тесты.

# 1.50.0-preview.9.7 — компактный редактор навыков

- Убраны повторные пояснения, декоративная шкала и карточная раскладка счётчиков. Оставлены очки, остаток и ошибки при некорректном распределении.
- Графическая лестница уменьшена до компактных ступеней, её можно свернуть. При изменениях она перерисовывается, не сбрасывая раскрытое состояние.
- Прокручиваемый список навыков занимает освободившуюся высоту; сами строки навыков уплотнены. Система ПК/NPC и ограничения распределения сохранены.
- Регрессионные проверки компактной компоновки и динамической лестницы.

# 1.50.0-preview.9.6 — динамическая пирамида навыков NPC

- NPC получают графическую пирамиду по фактическим положительным рангам (включая +5…+12), без фиксированного числа ячеек ПК и с переносом длинных рядов. Учитываются навыки дополнений.
- Добавление, удаление, изменение ранга и переименование сразу перестраивают ступени и счётчики. Стандартная пирамида ПК и её ограничения сохранены.
- Добавлены регрессионные проверки NPC и обновления без сохранения.

# 1.50.0-preview.9.5 — Динамическая пирамида навыков и установка из GitHub

- Пирамида Fate показана графически: ячейки +4×1, +3×2, +2×3, +1×5 с названиями навыков и заполнением в реальном времени.
- Значения распределено / осталось / бюджет изменяются сразу при вводе и удалении навыка. Исправлена ошибка селектора, которая прерывала обновление.
- Для ПК ввод ранга свыше +4, переполнение ступени или бюджета блокирует сохранение и показывает причину; NPC сохраняют свободную схему.
- Исправлены manifest/download GitHub; манифест указывает на raw JSON и установочный ZIP в dist репозитория.
- Добавлены автоматические проверки и браузерная симуляция ввода на двух ширинах.

# 1.50.0-preview.9.4 — Переработка создания способностей и развития навыков

- Редактор трюков: связанный навык выбирается из списка навыков персонажа и преднастроенного набора; необязательная связь сохраняется в формате `None` ради совместимости.
- Мастер вех: три сценария работы с трюками также используют выпадающий список навыков вместо ручного ввода.
- Редактор навыков: распределено / осталось / бюджет, подсказка по ступеням пирамиды, автоматический пересчёт при редактировании; бюджет 21 для ПК режима 2012, NPC без ограничения.
- Стандартные англоязычные заглушки `New Aspect`, `New Stunt`, `New Skill` отображаются по-русски в редакторах.
- Конструктор дополнений: структурирован по шагам, визуальные стартовые сценарии для трёх распространённых типов, основные механические эффекты раскрыты, введены пояснения и динамический предпросмотр.
- Поля выбора навыков в конструкторе эффектов тоже переведены в селект, без ручного набора.
- Механики, формат сохранения дополнений и существующие персонажи не мигрируются и не заменяются.
- Добавлен тест интерфейсного сценария; проверены компоновки в Chromium для ширины 1100 и 680 px.

# 1.50.0-preview.9.3 — Исправление редакторов навыков и аспектов

- Причина предыдущего неудачного исправления: новая разметка была сохранена в модуле, но оформление `DialogV2` могло не применяться в реальном окне Foundry. Предыдущая проверка проверяла наличие CSS, а не его фактическое использование.
- CSS из `styles/character-editors.css` теперь устанавливается непосредственно при открытии редактора. Стиль применяется после системных тем, повторно не дублируется. Код стиля и файл CSS проверяются на совпадение.
- Убран вложенный HTML `<form>` в диалоговом редакторе; используется стабильный корневой контейнер.
- В редакторе навыков — плотная сетка строк 46px с узкой колонкой ранга, отдельными кнопками удаления и внутренней прокруткой списка, поиск и закреплённые действия.
- В редакторе аспектов — карточки с заголовком и двумя полноразмерными многострочными полями, подписи строго сверху, отдельная прокрутка содержимого.
- Проверена разметка в headless Chromium на 1100×900 и 620×760 с измерением элементов и прокрутки; отдельно проверена работа динамического подключения стилей именно скриптом модуля (при отсутствии общего CSS).
- Существующая структура данных Fate Core Official и механизм обновления отдельными полями сохранены; экстра-владельческие свойства защищены от редактирования.
- Добавлен ui-editor-runtime.test.cjs; прочие функции модуля не изменялись.
- Ограничение: реальная игра Foundry и её сторонние пользовательские темы недоступны для выполнения в контейнере; браузерные проверки проводились на оболочке, имитирующей стандартную структуру DialogV2.

# Fate Toolkit v1.50.0-preview.9.2 — ревизия компоновки редакторов

Дата: 24.10.2026. Основа: v1.50.0-preview.9.1.

- Полностью перестроена разметка редакторов навыков, аспектов, трюков и последствий: заголовки полей отделены от контролов, поля выровнены, многострочные значения получают реальную ширину. Исправляет узкие textarea и несовпадающие блоки после наложения стилей Foundry.
- Навыки отображаются как компактные строки «Название | Ранг», с поиском и собственной прокруткой. Записи, полученные от дополнения, не редактируются здесь. Для тех, кому нужна информация об источнике навыка, она показывается через подсказку к значку.
- Расширенные параметры в конструкторе дополнений сворачиваются отдельно. В редакторе операции видны лишь поля, связанные с выбранным видом эффекта; скрытые значения не уничтожаются при переходах.
- Настройки мирового профиля перенесены из анкеты персонажа в раздел ведущего общей панели. В анкете остались настройки типа конкретного персонажа и его Воли. Применение профиля через новую кнопку сохраняет предпросмотр и подтверждение.
- В режиме кампании технический резерв трюков убран из шапки в свёрнутые настройки ведущего (данные не удаляются); вместо смеси «ПК/NPC» — «Игровой/Неигровой». Исправлены русские формы слова «дополнение» в окнах экспорта и библиотеки.
- Сохранены идентификатор модуля, данные Fate Core Official и остальные механики v1.50.0-preview.9.1. Автоматическая миграция существующих актёров не выполняется.

**Проверки:** 69 автономных наборов тестов, синтаксис всех JavaScript, JSON словарей, целостность ссылок в manifest и ZIP. Дополнительно на отдельном HTML-макете измерено положение и размеры полей редактора при 1000 и 550 px. Это не замена ручной проверки в Foundry.

---

## 1.50.0-preview.9.1 — исправление кнопок мини-панели (24.10.2026)

- Кнопка «Открыть анкету» в мини-панели теперь открывает анкету персонажа Fate Toolkit, независимо от выбранного системного листа Foundry.
- «Редактор дополнений» вызывает отдельный выбор дополнений, а не обработчик кнопки анкеты.
- Добавлен тест реальных обработчиков нажатия обеих кнопок и повторного открытия Toolkit-листа. Игровые правила не изменялись.

## 1.50.0-preview.8 — срочное исправление анкеты кампании 2012 (24.10.2026)

- Исправлена коллапсирующая шапка: многострочные мастерские кнопки больше не помещаются в узкий блок ресурса Воли. Кнопки настройки ПК/NPC и профильных навыков сгруппированы в отдельном раскрываемом разделе под шапкой, с нормальной шириной кнопок и селектора категории.
- Перемещены операции расхода Воли, восстановления через пристрастие и начисления за осложнение в самостоятельную горизонтальную панель; они не влияют на ширину счётчика и портрета.
- Изменена структура контейнера анкеты на гибкую колонку, чтобы добавление мастерской панели не ломало высоту тела листа и прокрутку. Открытое/закрытое состояние мастерской группы сохраняется при перерисовке анкеты.
- В режиме кампании 2012 новые персонажи Fate автоматически получают тип ПК и Волю 6/9 (только один раз на авторитетном клиенте GM). Существующие персонажи при включении режима автоматически не перезаписываются: остаётся ручная настройка ПК/NPC.
- Добавлен регрессионный набор тестов на раздельную компоновку шапки/управления и тесты одноразовой инициализации.

**Ограничение:** эта сборка устраняет конкретный дефект расползшейся анкеты и отсутствие автоматической стартовой Воли у новых персонажей. Другие замечания по редакторам, системе сцен и устаревшим жетонам ведущего не объявляются исправленными этой сборкой. Ручная проверка внутри Foundry пока не выполнялась.

## 1.50.0-preview.7 — хронология кампании и развитие персонажей (24.10.2026)

- Единая временная линия вех кампании: дата объявления, номер сессии, игровая дата, тип, завершённость участников и публичные итоги выбора.
- GM объявляет веху прежним мастером; участники проходят существующий пошаговый выбор, итоги автоматически связываются с общей историей.
- В персонажах добавлена вкладка «Развитие»: ступень (не заменяет правила Fate), очки навыков, пройденные вехи, выбранные изменения и пояснения владельца.
- История теперь не ограничивается двадцатью записями; добавлены снимки до/после применения и детализация выбора для новых записей.
- Сохраняются незавершённые выборы и начисленные очки; закрытие вехи блокируется при ошибке архивирования. Идентификаторы событий защищены от дублирования.
- Новые тесты хронологии и уровней. Подробнее: `docs/CAMPAIGN-MILESTONES-PREVIEW7.md`.

## 1.50.0-preview.6 — конструктор экстр и единая мини-анкета (24.10.2026)

- Условия, ветвления, сценовые и пост-бросковые триггеры, лимиты, повторное применение раз за сцену, длительности по числу срабатываний.
- Новые операции: временный бонус навыка, теги действия, снятие аспекта/состояния, последствие, запуск стандартных действий Fate.
- Библиотека шаблонов экстр внутри мира, выдача персонажу, копирование и пакетный JSON импорт/экспорт без состояния.
- Отдельный компактный виджет действий 4 иконки без текстовых карточек, с прежним drag-and-drop.
- Персональный dock с Волей, последствиями, статусами, экстрами и сворачиваемыми секциями инструментов.
- Регрессионные и дополнительные тесты. Новая система отключаема выбором инструментов UI, существующие данные не мигрируются автоматически.

## 1.50.0-preview.5 — первая встроенная версия конструктора экстр (24.10.2026)

- Продолжение **1.50.0-preview.4**, исходные механики и модуль `fate-aspect-widget` сохранены.
- Для существующих `Item / Extra` добавлены активная, пассивная и комбинированная программируемая конфигурация, разделение определения и текущего состояния.
- Редактор GM внутри анкеты, действия с Волей, аспектами сцены, бесплатными призывами, состояниями и счётчиками. Пассивные бонусы бросков подключены к проверке результата на стороне GM.
- Импорт/экспорт JSON одной или нескольких экстр, вставка через текст, файл JSON, предпросмотр перед импортом; перенос активных экстр в штатную панель макросов Foundry.
- Теги сохраняются без обязательного ввода игроком; эффекты с нераспознанными условиями не применяются автоматически.
- Статус: предварительная версия конструктора. **63 набора автотестов пройдены**, живой Foundry не проверен. Подробности: `docs/EXTRAS-PREVIEW5.md`.

## 1.50.0-preview.4 — 24.10.2026

- Постоянные переключатели ПК/NPC и категории NPC в анкете, сохранение текущей Воли при смене типа и отсутствие повторного восстановления при смене категории в той же сцене.
- GM-действие «Пропустить остаток урона» — сохранение уже оплаченного поглощения и снятие ожидания остатка.
- GM-действие «Отменить удар полностью» — возврат Воли, снятие последствий и выбывания с проверкой конфликта изменений. Защита от повторной отмены; отложенное состояние удара в трекере закрывается.
- Перед броском — необязательная галочка «Сделка с дьяволом» и описание осложнения, подтверждаемого ведущим через аутентифицированный RPC. При принятии +1 Воля без бонуса к броску, запись в чате и аудите результата.
- Новые отдельные проверки сделки, прав GM на пропуск, отката уже оплаченных поглощений и повторного переключения типа. **62/62** наборов тестов пройдены. Запуск непосредственно в Foundry не проводился.

## 1.50.0-preview.3 — 23.10.2026

- **Поглощение Волей:** оплата от 1 до доступного числа сдвигов урона и совместимость с несколькими последствиями за удар. Стресс не участвует в поглощении в режиме кампании. Предусмотрены отмена и компенсационный возврат при сбое сохранения.
- Разработан профиль кампании 2012: 19 канонических навыков, пять аспектов ПК, переименование известных системных навыков (в том числе Lore и Will), перенос ссылок трюков/треков, сохранение рангов и значений; резервная копия старых данных, без удаления неизвестных записей.
- Встроено создание ПК с лимитами 21 очко / +4 и проверкой стартовой пирамиды. Для NPC сохраняются другие распределения и произвольное число аспектов в пределах их лорной категории.
- Добавлено ручное обновление списка навыков мира Fate Core Official.
- Добавлена оплата флэшбеков, сопротивления и прочих действий через Волю, с вводом цены и журналом в чате; начисление +1 за принятое осложнение по аспекту — командой мастера.
- NPC в активном конфликте могут восстанавливаться автоматически на старте повествовательной сцены; повторное восстановление в той же сцене исключено.
- Исправлены локализации интерфейса и компенсационные операции при отмене поглощения; расширены тесты миграции, поглощения и Воли.
- **60/60** автономных наборов пройдены. Запуск внутри Foundry ещё не проверялся.

## 1.50.0-preview.2 — 23.10.2026

- Добавлена добровольная уступка в трекер, сетевое подтверждение через GM и журнал условий поражения.
- Отложенное восстановление Воли после завершения конфликта: +1 и +1 за каждое полученное, не отменённое последствие; повторная выплата исключена.
- В режиме кампании запрещено использование стресса для поглощения урона; сохранена возможность принимать несколько последствий и отмечать выбывание.
- Новые regression-тесты системы уступок и ущерба; 58/58 успешно.

## 1.48.2

- Исправлена ложная ошибка «Выбранный ранг выше разрешённого потолка этой вехи»: валидатор больше не сравнивает с потолком уже существующие, не повышаемые навыки персонажа.
- Потолок применяется только к фактическому повышению ранга в текущей вехе; уже имеющийся высокий ранг можно сохранить без блокировки мастера вех.
- Серверная проверка применения вехи приведена к той же логике, чтобы старые/сохранённые черновики не расходились с интерфейсной валидацией.

## 1.48.1

- Портрет кастомной анкеты приведён к нативной разметке ActorSheet/Fate Core Official: `data-edit="img"`, `data-action="editImage"`, `profile-img`.
- Убран переключатель «Портрет / Токен»: изображение в шапке снова всегда является `actor.img`, как в стандартной анкете.
- Добавлен прямой мост к публичному API Tokenizer (`vtta-tokenizer`) для кастомного ApplicationV2-листа с сохранением его обычной логики клика/Shift-клика и пользовательских настроек.

## 1.48.0
- Новая анкета доведена до паритета по редактированию данных персонажа со стандартным листом Fate Core Official 4.7.13.6: системные редакторы навыков, аспектов, треков и трюков открываются прямо из Toolkit.
- Трюки теперь можно полноценно добавлять, редактировать и удалять; сохранены бросок связанного трюка, ячейки, запуск/открытие макроса, база трюков и загрузка трюков в неё.
- Возвращены действия стандартного листа для треков и Extras: управление составом и параметрами треков, броски треков, заметки, добавление/открытие/включение/удаление Extras.
- Возвращена совместимость drag-and-drop Fate Core Official для навыков, аспектов, трюков, треков и Extras; перед переносом Extra текущее состояние его треков и трюков синхронизируется обратно в Item, как в стандартной анкете.
- Добавлены служебные действия стандартного листа: синхронизация имени токена, сохранение и применение шаблонов персонажа, GM-overrides для Refresh и очков навыков.
- Системные редакторы, открытые из Toolkit, получают увеличенные контролы и собственный русский слой по стабильным полям/кнопкам, а не только по английскому тексту Fate Core Official.

## 1.47.2
- Убран свободный прямой ввод ранга навыка из анкеты: он обходил системные ограничения.
- «Управление навыками» теперь проверяет ограничения Fate Core Official перед сохранением: колонку навыков, лимит очков и допустимый диапазон рангов.
- В редакторе отображается текущая валидность конфигурации и расход очков; при нарушении правил сохранение блокируется.
- Навыки, пришедшие из Extras, помечаются как системные и не редактируются/не удаляются этим окном.

# 1.47.1

- Навыки в новом листе теперь редактируются прямо в списке: ранг — обычное числовое поле.
- В заголовок навыков добавлено «Управление навыками»: можно включать/убирать навыки мира и добавлять свой навык.
- Вкладки `PLAY / STORY` переименованы в понятные «Механика» и «Текст и заметки».
- Английский словарь модуля теперь намеренно содержит те же русские строки, что и русский: интерфейс Toolkit остаётся русским независимо от языка Fate Core Official/Foundry.

## 1.47.0
- Анкета больше не использует урезанную «копию» данных стандартного листа: основные поля читаются напрямую из канонических путей Fate Core Official с legacy-fallback только для старых миров.
- «Описание», «Биография» и «Заметки» переведены в одноколоночный полноширинный режим; редакторы получили нормальную высоту и растут вместе с текстом вместо маленькой внутренней области прокрутки.
- ProseMirror подключён тем же способом, что в стандартном листе Fate Core Official (`toggled`, `data-document-u-u-i-d`, `collaborate`), чтобы существующий HTML корректно показывался и сохранялся.
- Возвращены скрывавшиеся данные нативного листа: boosts, описание и заметки аспектов, форматированный текст и заметки трюков, описание/заметки/условия восстановления треков.
- GM может переключать приватность заметок прямо из новой анкеты.
- Многострочные значения аспектов больше не зажаты в двухстрочное поле.

## 1.46.4

- Оценки результата по лестнице Fate теперь отображаются наречиями: «Хорошо», «Отлично», «Великолепно» и т. д.
- Названия рангов как терминов отделены от подписей результата, чтобы формы больше не конфликтовали грамматически.

# 1.46.3

- Кнопки последствий в поглощении урона больше не становятся «мёртвыми», если закрыть окно ввода или подтвердить пустое название: действие можно нажать повторно.
- То же правило применено к остальным пользовательским кнопкам результата с отменяемым диалогом/подтверждением: создание аспекта, усиление, контекстное действие результата, выбывание и завершение хода остаются повторно доступными, пока состояние реально не изменилось.
- Убраны одноразовые DOM-listener'ы из динамических чат-контролов; защитой от повторной записи остаются серверные блокировки и фактическое изменение состояния сообщения.

# 1.46.1

- Окно «Действие Fate» больше не остаётся в состоянии ожидания после появления разрешённого результата: его pending-состояние очищается, а окно закрывается.
- Центр действий увеличен и получил понятные пояснения четырёх действий; на узкой ширине карточки складываются в одну колонку и больше не разрывают русские слова.
- Поглощение удара полностью перевёрстано под узкий чат: один вариант на строку, нормальная высота кнопок, явное объяснение величины поглощения.
- Системные названия треков (`Mental Stress`, `Mild Consequence` и т. п.) переводятся только на уровне интерфейса модуля, без изменения данных персонажа.
- Английские подписи нативных пост-бросковых кнопок Fate Core Official и английская ступень лестницы в сообщениях Toolkit заменяются собственными русскими подписями модуля.

# 1.46.0

- Переброс теперь сохраняет реальные текущие модификаторы броска, а не устаревший математический снимок; после призыва/переброса снимок и история синхронизируются.
- Убрано скрытое управление Shift+кликом: выбор навыка и трюков открывается всегда, а предыдущий навык только предвыбирается.
- Боевой трекер больше не использует вылезающие за окно абсолютные подменю: действия участника раскрываются внутри его строки.
- Русификация отвязана от локализации Fate Core Official; стандартные навыки, лестница и служебные значения имеют собственные русские отображаемые имена.
- Убраны английские fallback-строки в интерфейсных вызовах модуля.
- Снижено декоративное скругление, текстовые кнопки и метки теперь растут по содержимому и переносят русский текст без сдавливания.

# 1.45.3 — Character artwork preservation

- Fixed the custom character sheet erasing an actor portrait or prototype-token image during ordinary auto-submit.
- Portrait editing now routes through Foundry V13's inherited DocumentSheetV2 image picker using an explicit sheet action and the actual image element as the edit target.
- Added a defensive form-data guard: blank image fields generated by the sheet can no longer overwrite existing artwork, while explicit non-empty image changes still pass through.

# 1.45.1 — Scroll, stacking, and legacy notes fixes

- Fixed the main aspect list getting stuck instead of scrolling to the bottom by giving the ApplicationV2 content chain a real flex/min-height scroll viewport and registering `.faw-scroll` as the window's scrollable part.
- Replaced shared-row pseudo-columns on the character sheet with genuinely independent vertical stacks, so Stunts sit directly below Skills instead of waiting for the tallest block in the other column.
- Added compatibility reads for legacy/native Notes field shapes and source data so existing sheet notes are visible in the new Story tab.
- Preserved legacy stunt `notes` separately from `description`; an empty description no longer masks existing stunt notes.

# 1.45.0 — Real-window layout overhaul

- Rebuilt responsive behavior around each Foundry application window using CSS container queries instead of browser viewport breakpoints.
- Action Center: aligned actor/target selector stacks, increased quick-action hit areas, and guaranteed wrapping for long translated action names.
- Aspect widget: removed the verbose fixed-invoke pseudo-label; the fixed invoke stays compact and is explained by its tooltip.
- Character sheet: enlarged portrait, replaced the overflowing Fate Point pill with a stable resource card, added a default Fate-specific two-column layout where Stress & Consequences can sit directly below Aspects independently of Skills, and retained user-custom layouts as a fallback.
- Character story fields now use Foundry v13 ProseMirror/enriched HTML instead of exposing stored HTML tags in plain text controls.
- Renamed the generic Tracks heading to Stress & Consequences in the sheet UI.
- Milestones: completed Russian terminology for Refresh/linked-skill placeholders and made resource cards, legality text, wizard steps, actor metadata, and footer actions wrap safely in narrow windows.
- Added screenshot-regression contracts for the layout failures reported in 1.44.

## 1.44.0

- Completed a reference-parity pass against concrete PF2e, D&D5e and Tidy 5e production UI patterns while preserving Fate-specific semantics.
- Character sheet tabs now use roving tabindex and Arrow Left/Right, Home and End navigation, with focus restored after the ApplicationV2 rerender.
- Filter/action clusters now expose explicit toolbar/group semantics instead of relying on visual proximity alone.
- Request target, skill, opponent, opposition-skill, stunt and action-skill searches now provide live visible/total feedback.
- Decorative Font Awesome icons in production templates and JS-generated UI are consistently hidden from the accessibility tree; actual controls remain named.
- Added `docs/UI-REFERENCE-PARITY-v1.44.md` and `reference-parity.test.cjs`, which audits the production markup/scripts rather than documentation claims.
- Fixed stale release metadata: module, package and release tests now agree on 1.44.0.

## 1.42.0

- completed the component audit for dynamic chat-action UI instead of leaving it outside the Handlebars/window inventory;
- restored the missing `invokeSourceRowHtml()` runtime generator, fixing a real invoke-panel `ReferenceError` that static window tests did not catch;
- rebuilt invoke rows around one primary identity/context block, compact resource badges, and only valid +2/reroll routes; paid actions remain visible but disabled when the roller has no Fate Points;
- added localized invoke filters/search, live visible/total feedback, semantic list/group roles, filtered-empty feedback, and explicit accessible names;
- rebuilt damage resolution chat UI with localized state, grouped hit/absorbed/remaining metrics, explicit dangerous take-out styling, accessible consequence input, and semantic action groups;
- localized the chat-action scopes and direct player-facing error/confirmation surfaces added by these panels;
- added `chat-ui.test.cjs`, which loads the production chat module in a Foundry stub and executes the real invoke-row generator in addition to static accessibility/localization checks;
- chat controls now keep a 32px desktop target floor and 40px coarse-pointer target floor.

## 1.41.0

- Completed a component-level UI audit against mature Foundry sheet patterns (D&D5e, Tidy 5e, PF2e, and Fate Core Official).
- Character-sheet Play / Story navigation now uses semantic tablist / tab / tabpanel roles; Action Center remains a separate action.
- Stateful UI controls expose `aria-pressed` / `aria-current` consistently across sheet, aspects, milestones, combat, and workflow UI.
- Standardized desktop icon-control targets at 32 px (30 px compact) while retaining 38–40 px touch targets.
- Added structured empty states, stronger destructive affordances, a metadata readability floor, and a third Comfortable sheet density.
- Character-sheet search now provides live visible/total feedback and explicit list relationships.
- Added component-level regression coverage and a documented component audit matrix.

# 1.40.0

- Added coarse-pointer/touch-specific interaction rules so contextual secondary actions are never hover-only on touch devices.
- Increased touch targets to at least 38px for Toolkit action controls while preserving denser desktop layouts.
- Added Windows/high-contrast `forced-colors` support with explicit focus, selected and audit-highlight states.
- Added input-modality regression coverage.

# 1.39.0

- Replaced the old browser-local binary density preference with a per-user Toolkit UI profile.
- Added Compact, Standard and Comfortable density profiles across all Toolkit-owned windows and dialogs.
- Added an independent per-user text-size preference with Small, Standard and Large options.
- Added a one-time migration that preserves the previous browser-local Compact/Standard choice when a user first opens v1.39.
- Comfortable mode increases spacing and control targets without changing game data or another user's interface.
- Added UI personalization regression coverage.

# 1.38.0

- Added a read-only runtime UI diagnostic exposed as `game.modules.get("fate-aspect-widget").api.runUiDiagnostic()`.
- The diagnostic inspects currently rendered Toolkit windows for horizontal overflow, escaped bounds, undersized action targets, missing accessible names and text contrast.
- Optional highlighting marks problematic live elements without mutating Foundry documents or user data.
- Removed effective hard minimum widths from request/sound surfaces and hardened milestones/combat for very narrow windows down to the practical Foundry viewport limit.
- Raised legacy microcopy and compact-mode interaction targets to safer minimum sizes.
- Added a dedicated 420px layout pass for combat, request and milestone surfaces.
- Added runtime-diagnostic and responsive-hardening regression suites.

# 1.37.0

- Completed the third UI inventory pass and covered every remaining Toolkit-owned DialogV2 surface.
- FateToolkitUX confirmations now receive a shared visual shell, including a distinct destructive-state treatment.
- Styled compact aspect/consequence editors and the character-sheet custom-field editor with the same field hierarchy, focus treatment and responsive behavior as other Toolkit windows.
- Localized and restyled the consequence-name prompt used by chat damage resolution.
- Localized the Help window title through the existing `FAW.Help` key.
- Added a full dialog-coverage regression suite to prevent future Toolkit dialogs from silently falling back to unstyled Foundry-default surfaces.

# 1.36.0

- Completed the second UI audit pass for dynamically generated DialogV2 surfaces: GM opposition, player opposition, Defense, skill/stunt selection, Create Advantage, Overcome confirmation, aspect creation and boost creation.
- Unified temporary dialogs with the same visual tokens, hierarchy, focus treatment, responsive layout, high-contrast mode and reduced-motion behavior as persistent Toolkit windows.
- Removed authored Cyrillic copy from standalone UI services and localized dynamic dialog titles, labels, hints, buttons and search affordances in RU/EN.
- Added accessible labels to dynamically generated search and icon controls.
- Added a dedicated dynamic-dialog regression suite covering localization boundaries, accessible generated searches and the shared DialogV2 visual layer.
- Preserved request/form selectors, RPC behavior and Fate rules; this release is an interface-only pass.

# 1.35.0

- Completed a cross-window UI audit using mature Foundry sheet patterns as references.
- Added a shared visual polish layer for every Toolkit window, including responsive and high-contrast behaviour.
- Reworked the Action widget hierarchy and collapsed its long instruction text into contextual help.
- Reworked GM roll requests into a clearer recipient → action/check flow without changing request semantics.
- Improved combat, workflow, milestones, request cards, sound settings, help, aspect widget and character sheet presentation.
- Localized all authored Handlebars UI copy in RU/EN.
- Added static UI-quality regression tests for localization, accessible names, search labels, responsive breakpoints, reduced motion and contrast support.

## 1.34.0
- Added per-user/per-Actor visual profiles to the custom character sheet.
- Added Foundry, Paper, and Midnight themes plus a personal accent color picker.
- Visual preferences remain user-scoped and never mutate Actor/system data or another user’s sheet appearance.
- Theme/accent normalization falls back safely for invalid persisted values.

## 1.33.0
- Added native drag-and-drop section ordering to the per-user/per-Actor character-sheet layout customizer while retaining explicit move buttons.
- Custom field definitions can now be edited after creation without deleting their stored value.
- Added custom field placeholder, counter maximum, and normal/full-width layout options.
- Drag ordering remains user-scoped; shared Actor data is not mutated by personal layout changes.

## 1.32.0
- Added an opt-in responsive `ActorSheetV2` for `fate-core-official` actors without replacing the system sheet automatically.
- Added a persistent play header with Fate Points and direct Attack, Overcome, Create Advantage and Defend entry points into the existing Fate Toolkit action workflow.
- Added searchable Aspects, Skills and Stunts, per-user favorites, stress/consequence presentation, Extras controls, Story sections and shared Actor custom fields.
- Added per-user/per-Actor layout preferences for section ordering, visibility, width, density and portrait/token artwork mode using Foundry v13 user-scoped settings.
- GM-only system notes are excluded from player render context rather than merely hidden with CSS.
- Added responsive narrow-window behavior and reused Foundry v13 DocumentSheetV2 image editing and form submission.
- Added character-sheet contract/regression coverage; total suites: 35.

## 1.31.0
- Added an authenticated multi-client Foundry diagnostic exposed as `game.modules.get("fate-aspect-widget").api.runMultiClientDiagnostic()`.
- The active primary GM probes every connected non-GM client through socketlib and each client performs a reverse authenticated RPC echo back to the GM.
- Added real-client visibility checks for public, GM-only and per-user whisper ChatMessages, including cross-player whisper isolation.
- Added a synthetic hidden-opposition privacy probe using the production `FateToolkitOppositionPublic` boundary; remote clients reject any forbidden hidden fields.
- Added remote inspection for legacy/private workflow keys leaking through synchronized User flags.
- Diagnostic sessions expire automatically, require the active primary GM, and clean up all temporary ChatMessages even after partial document-creation failure.
- Added a two-player simulated multi-client regression suite; total contract/regression suites: 34.

## 1.30.0
- Hardened turn finalization: an optional result `messageId` must resolve to a completed Fate result for the current combatant Actor and, for players, explicitly target the authenticated user.
- Advanced the data schema to 5. Player pending requests, action drafts, pending actions, opposition queues and milestone drafts now persist in browser-private storage instead of synchronized `User.flags`.
- Added fail-closed migration of legacy private player flags; current-client state is preserved locally when possible and network-visible legacy flags are removed.
- Kept `persistentActionHandoffsV1` network-durable by design, while asserting that only sanitized `publicRequest` data is stored.
- Added read-only legacy fallbacks to avoid losing the current client's state if Foundry ready hooks overlap during the schema-5 upgrade.
- Added dedicated turn-spoof, migration and static security-audit regression coverage.

## 1.29.0
- Isolated paid Fate Point and free-invoke resource consumption behind FateToolkitInvokeResource with rollback closures.
- Isolated invoke/reroll authorization and result application behind FateToolkitInvokeResolution prepare/commit phases.
- Resource consumption is rolled back automatically if the ChatMessage mutation fails.

## 1.28.0
- Isolated turn finalization behind FateToolkitTurnFinalization prepare/commit phases.
- Player ownership, current-turn and pending-damage checks are authoritative before hasActed/turnFinalized/next-turn world mutations.
- Remote combat RPC now delegates those checks to the service instead of duplicating security logic.

## 1.27.0
- Extended FateToolkitDamageResolution with authoritative taken-out and undo-taken-out transitions.
- Combatant defeated state, damageResolution flags, audit and conflict events now commit behind the same damage-state boundary.
- Controller retains only locks, dispatch and UX errors.

## 1.26.0
- Isolated stress/consequence application behind FateToolkitDamageResolution with separate authoritative prepare and world-commit phases.
- Controller retains only GM execution lock, dispatch and UX error reporting; the service owns no Dialog/RPC/socket transport.
- Added regression coverage for stress, consequences, duplicate stress selection and consequence naming.

## 1.25.0
- Isolated post-result aspect world-commit from authorization: free invokes, Overcome removal, scene-aspect creation, result-card flags, audit and conflict events now live behind FateToolkitResultActionCommit.
- Confirmation UI remains in orchestration; the commit service owns no permissions, request maps or RPC.

## 1.24.0
- Isolated boost world-commit from authorization: boost creation, result-card update, audit and conflict event now live behind FateToolkitBoostClaimCommit.
- Controller retains only lock, authoritative plan and commit dispatch.

# Fate Toolkit 1.23.0

Opposition refresh projection:
- added `scripts/opposition-refresh-compute.js` for recomputing outcome/boost, public flags, audit and result-card flavor after active opposition changes;
- hidden opposition identifiers/totals stay absent from the rebuilt public flags;
- previous damage resolution, boost, created aspect and contextual-result derived state is reset in one tested projection before the new result is committed;
- rollback, ChatMessage mutation and sound dispatch remain in the controller;
- added visible/hidden privacy regression coverage;
- reduced `roll-request.js` from 3062 to 3037 lines.

# Fate Toolkit 1.22.0

Shared roll revision detection:
- added `scripts/roll-revision.js` for relevant-hook detection, explicit reroll recognition, duplicate-signature suppression and revision math/history for both player results and active opposition;
- `maybeReresolve` and `maybeReresolveOpposition` now share the same tested reroll/noise rules instead of maintaining parallel logic;
- the service performs no document updates, persistence or RPC;
- added tests for noisy hooks, same-signature suppression, explicit rerolls and opposition changes;
- removed duplicated reroll math from `roll-request.js`.

# Fate Toolkit 1.21.0

Defend choice UI isolation:
- added `scripts/defend-choice-ui.js` for the defend-context DialogV2, skill search, stunt selection and Create Advantage subtype control;
- `chooseActionSkill` now owns only default selection, dialog invocation, remembered skill and final stunt validation;
- the UI service owns no RPC, request maps or world mutation;
- added a dedicated UI suite for serialized defend context and dynamic Create Advantage controls;
- reduced `roll-request.js` from 3137 to 3095 lines.

# Fate Toolkit 1.20.0

Post-result action authorization boundary:
- added `scripts/result-action-plan.js` shared by contextual Create Advantage/Overcome actions and automatic scene-aspect creation;
- the plan revalidates ChatMessage, sender, Actor ownership, target user and current opportunity before any world mutation;
- blank aspect names are rejected before calling the scene-aspect API;
- mutation, confirmation UI, ChatMessage flags and audit remain in their concrete handlers;
- added authorization regression coverage for players and GMs;
- reduced duplicated validation in `roll-request.js`.

# Fate Toolkit 1.19.0

Opposition reroll revision boundary:
- added `scripts/opposition-revision.js` to re-authorize a changed opposition ChatMessage and rebuild a new opposition snapshot from the authoritative roll;
- validation covers request/initiator, message identity/author, opposing Actor ownership, skill and stunt normalization;
- the stored GM opposition object is not mutated until the controller commits the rebuilt copy;
- persistence, UI refresh and initiator-card re-resolution remain outside the service;
- added regression tests for pending requests, wrong author/ownership and immutable successful rebuilds;
- reduced `roll-request.js` from 3175 to 3139 lines.

# Fate Toolkit 1.18.0

Boost claim authorization boundary:
- added `scripts/boost-claim-plan.js` to validate requesting user/Actor ownership, recipient rules, completed-turn lock, damage-resolution trade lock and private opponent recipient resolution;
- the plan is read-only and cannot create boosts, update ChatMessage, append audit or emit RPC;
- `claimBoostOnGm` now applies mutations only after a successful authorization plan;
- added regression coverage for player/opponent restrictions, GM hidden-opponent targeting and combat locks;
- reduced `roll-request.js` from 3187 to 3175 lines.

# Fate Toolkit 1.17.0

Pure request-result computation:
- added `scripts/request-result-compute.js` for difference/outcome/boost calculation, public audit construction, resolved-card rendering input and final public flag payload;
- Foundry document rollback/update, request persistence, sound dispatch and RPC acknowledgements remain in `resolveOnGm`;
- hidden opposition privacy is asserted directly at the computed public flag boundary;
- added tests for visible, hidden and no-opposition result payloads;
- reduced `roll-request.js` from 3245 to 3187 lines.

# Fate Toolkit 1.16.0

Authoritative request-result validation boundary:
- added `scripts/request-result-validation.js` for GM-side request assignment, ChatMessage ownership, Actor ownership, skill/stunt and initial-formula validation;
- validation is read-only: it does not update ChatMessage, persist requests, emit RPC or apply Fate results;
- `resolveOnGm` now receives a validated context before any rollback/world mutation occurs;
- added regression cases for wrong target, message author, actor ownership, missing skill and tampered initial math;
- reduced `roll-request.js` from 3280 to 3245 lines.

# Fate Toolkit 1.15.0

Player opposition roll isolation:
- added `scripts/player-opposition-roll.js` as the owner of selected-skill validation, remembered skill update, stunt normalization, roll math and normalized opposition payload construction;
- ChatMessage creation remains an injected callback and authenticated RPC remains in the controller;
- player opposition orchestration now separates ownership/fallback, UI, roll resolution and transport;
- added a dedicated roll service suite for validation and payload shape;
- reduced `roll-request.js` from 3290 to 3280 lines.

# Fate Toolkit 1.14.0

Player opposition UI isolation:
- added `scripts/player-opposition-ui.js` as the owner of the player active-opposition DialogV2 markup, skill/stunt search binding and form serialization;
- ownership validation, fallback-to-GM, roll creation, ChatMessage creation and authenticated RPC remain outside the UI service;
- preserved the exact action summary through an injected formatter callback;
- added a dedicated UI contract suite;
- reduced `roll-request.js` from 3315 to 3290 lines.

# Fate Toolkit 1.13.0

GM opposition UI isolation:
- added `scripts/action-opposition-ui.js` as the owner of the GM opposition DialogV2 markup, field serialization and dynamic target/skill/stunt controls;
- `resolveActionAsGm` is now a short prepare → dialog → resolve → finalize orchestration path;
- UI service receives callbacks for Fate data/search rendering and owns no request maps, persistence, RPC or finalization;
- added a dedicated UI contract suite for content, form serialization, reject behavior and dynamic render initialization;
- reduced `roll-request.js` from 3411 to 3315 lines.

# Fate Toolkit 1.12.0

GM action-opposition orchestration boundary:
- added `scripts/action-opposition.js` as the owner of GM opposition preparation and normalized resolution for none/fixed/rank/roll modes;
- the service receives explicit callbacks for actor resolution, Fate rules, rolling and ChatMessage creation and remains free of DialogV2, request maps and RPC transport;
- `resolveActionAsGm` now owns only the dialog interaction, decline notification, target assignment and handoff into finalization;
- added a dedicated action-opposition suite covering fallback targets, fixed/none modes, passive rank, active roll, hidden state and validation failures;
- reduced `roll-request.js` from 3473 to 3411 lines without changing persistent flags or authenticated RPC contracts.

# Fate Toolkit 1.7.1

Refactor parity checkpoint:
- added a regression suite that locks the hardened 1.0.1 RPC, permission, and data-migration files by SHA-256 during the architecture-only refactor line;
- asserts data schema 4 and the exact persistent flag-name inventory;
- asserts the two public roll/action module API blocks retain the same macro/debug keys as 1.0.1;
- templates, styles, and localization remain byte-identical to 1.0.1.

# Fate Toolkit 1.7.0

Sound-settings UI isolation:
- moved the complete outcome-sound settings ApplicationV2 into `scripts/sound-settings-ui.js`;
- the UI now depends only on the shared window runtime, outcome-sound service, Foundry settings/FilePicker, and the shared UX helper;
- `roll-request.js` retains only the public/open callback and raw playSound receiver needed by the workflow;
- reduced `roll-request.js` from 3917 to 3823 lines with no gameplay/RPC changes.

# Fate Toolkit 1.6.0

Shared ApplicationV2 runtime:
- added `scripts/window-runtime.js` as the single owner of the Handlebars ApplicationV2 base, safe window base class, and common render/restore helpers;
- removed duplicate window bootstrap code from `main.js` and `roll-request.js`;
- removed the unused duplicated viewport/clamp/sanitize helpers instead of carrying dead geometry code forward;
- kept Foundry-native minimize/maximize behavior unchanged;
- all 13 contract/regression suites remain green.

# Fate Toolkit 1.5.0

Service-contract hardening:
- added `scripts/runtime-contracts.js` and a fail-fast bootstrap check before the roll controller consumes extracted services;
- added a dedicated service runtime suite for persistence row trimming, result-rule behavior, Fate skill rules, and missing-service failure;
- raised the contract/regression suite count to 13 while preserving gameplay behavior.

# Fate Toolkit 1.4.0

Result-rule decomposition:
- extracted pure Fate result evaluation into `scripts/result-rules.js`: action labels, outcome mapping, boost opportunities, contextual aspect actions, and automatic Create Advantage aspect opportunities;
- kept all world mutation, permission checks, chat rendering, and RPC handling in the controller;
- reduced `roll-request.js` from 4153 to 3961 lines;
- existing rules tests now exercise the same extracted functions through the controller aliases, preserving the public/test contract.

# Fate Toolkit 1.3.0

Durable action-state decomposition:
- added `scripts/action-state.js` as the owner of authenticated proposal cache, action draft persistence, pending action state, player handoffs, and per-user skill preferences;
- the state service receives explicit callbacks for UI refresh, approved-action handling, scene identity, and skill lookup instead of importing the controller;
- opposition queue orchestration remains in `roll-request.js` because it is still tightly coupled to the active dialogue/workflow;
- reduced `roll-request.js` from 4335 to 4153 lines without changing flags, RPC contracts, or gameplay behavior;
- extended architecture regression checks to keep durable state out of the UI controller.

# Fate Toolkit 1.2.0

Second architecture-only decomposition step:
- extracted Fate domain rules from `roll-request.js` into `scripts/fate-rules.js`: skill/stunt normalization, core-action suitability, opposition-action mapping, and suggested opposition skills;
- kept HTML/search widgets in the controller while moving rules and actor data interpretation behind an immutable service API;
- reduced `roll-request.js` from 4540 to 4335 lines;
- preserved public module API, flags, RPC payloads, and Fate resolution behavior;
- extended architecture regression checks to enforce the new service boundary and load order.

# Fate Toolkit 1.1.0

Architecture-only refactor on top of the hardened 1.0.1 behavior:
- extracted browser-private workflow persistence from `roll-request.js` into `scripts/private-storage.js`;
- extracted roll math, revision history, chat audit rendering, and presentation helpers into `scripts/roll-presentation.js`;
- extracted outcome-sound settings/playback/routing into `scripts/outcome-sounds.js`;
- reduced `roll-request.js` from 5123 to 4540 lines without changing its public API or Fate resolution rules;
- updated the Node harness to load the same service dependency order as Foundry;
- added an architecture regression suite that enforces service load order and prevents the extracted implementations from drifting back into the controller.

# Fate Toolkit 1.0.1

Target stack remains Foundry VTT **13.351** + Fate Core Official **4.7.13.6**. `socketlib >= 1.1.3` is now a required module dependency.

Release hardening:
- replaced state-changing raw module socket traffic with authenticated socketlib RPC; handlers authorize against the transport sender rather than client-supplied `userId`;
- standardized primary-GM authority on Foundry's `game.users.activeGM`;
- reduced hidden opposition to a strict public DTO and removed hidden actor/message identifiers from public result flags;
- added schema 4 repair for legacy hidden-opposition data, durable request/handoff rows, and removal of legacy GM-private User flags;
- moved GM request/authentication queues out of world-synchronized User flags into a browser-local GM cache while retaining same-client F5/reconnect recovery;
- moved aspect favorites and action-skill preferences from device-wide `client` storage to Foundry v13 `user` settings with migration of legacy values;
- preserved GM-only hidden-opposition workflow through private GM request state instead of public flags;
- added an in-Foundry integration smoke runner, including an optional temporary ChatMessage/whisper round-trip;
- expanded the Node contract/regression suite to 11 suites covering RPC sender identity, privacy DTOs, data migration, settings scope, and release socket invariants.

# Fate Toolkit 1.0.0

Target stack: Foundry VTT **13.351** + Fate Core Official **4.7.13.6**.

1.0 freezes the feature set built through the 0.17–0.90 cycle and focuses on release stability. The toolkit now covers searchable/remembered action setup, Fate-native conflict resolution, contextual UI, reload-safe workflows, audit history, advanced aspect/Create Advantage/Overcome handling, GM dashboard, UI profiles, versioned data repair, server-side permission checks, render-performance controls, integration tests, UX-shortened common flows, and contextual in-app help.

Release stabilization:
- manifest compatibility is pinned to the exact verified Foundry/system pair;
- migration schema 2 remains the upgrade boundary and strips obsolete/private audit fields;
- eight integration suites plus a release-integrity suite run in the packaged source tree;
- manifest file references and Handlebars structure are checked before packaging;
- six confirmed unreferenced helpers and a noisy initialization log were removed;
- no new gameplay feature was added after the 0.90 onboarding layer.

## 1.8.0
- Вынесены GM/player окна запросов броска в `roll-request-ui.js`.
- UI получает данные и команды через callbacks и не владеет картами запросов или RPC-транспортом.
- Добавлен архитектурный инвариант, запрещающий возвращать request windows в основной roll-контроллер.
- Поведение, публичный API, persistent flags и hardened security/data contracts сохранены.

## 1.8.1
- Исправлено отображение скрытой активной оппозиции после перехода на строгий public DTO.
- Игрок больше не видит пустые/`undefined` имя и навык: выводится только нейтральный статус скрытой оппозиции.
- Добавлен регрессионный тест на отсутствие секретных/редактированных полей в тексте.

## 1.9.0
- Публичная проекция оппозиции вынесена в `opposition-public.js`.
- Hidden opposition проходит через fail-closed boundary: секретные поля не копируются в player DTO.
- Текстовое представление public DTO живёт рядом с проекцией и тестируется отдельно.

## 1.10.0
- Persistence player/GM запросов вынесена в `request-state.js`.
- GM request state по-прежнему хранится только browser-private; transport и User flags отделены от сервиса.
- Добавлен runtime regression: сохранение скрытого GM-запроса не вызывает `User.setFlag()`.

## 1.11.0
- Authoritative построение GM roll request вынесено в `request-builder.js`.
- Builder валидирует цели, навыки и режимы оппозиции, но не знает о UI, maps, persistence или RPC.
- Добавлен отдельный builder-suite для fixed/none/opponent и validation failure.

## 1.45.2
- Chat invoke chooser is now collapsed by default; the full list of invokable aspects is created only when the user presses “Invoke aspect”.
- Pressing the launcher again collapses the chooser, keeping result cards compact during normal chat use.

## 1.46.2
- Убраны поясняющие абзацы из четырёх кнопок Fate-действий: в рабочем окне остаются только название действия, иконка и при наличии предвыбранный навык.
- Высота кнопок возвращена к компактному размеру, чтобы центр действий не занимал пол-экрана без необходимости.

## 1.50.0-preview.9 — 24.10.2026

Обновление по результатам пользовательского тестирования `preview.8`. **Без изменения согласованных правил Fate; данные мира и персонажей не очищаются.**

- Переведены русскоязычные подписи модуля на единый термин **«дополнение»** вместо «экстра» в редакторе, библиотеке, подсказках, ошибках и мини-панели. Технический тип `Item/Extra` не переименован.
- Убраны дублирующие четыре действия из игровой вкладки анкеты и из личной мини-панели; отдельный компактный виджет сохранён.
- Добавлены собственные компактные редакторы навыков, аспектов, трюков и последствий/состояний, которые изменяют существующие данные Fate Core Official без массовой перезаписи. Поля, выданные предметами Extra, не редактируются через обычные редакторы. У игроков в кампании 2012 ограничены сумма начальных навыков и максимальный ранг.
- Введено управление мировыми наборами навыков/аспектов через GM-раздел мини-панели. Для полностью пустого мирового справочника в режиме 2012 происходит безопасная первоначальная загрузка 19 навыков и пяти аспектов; прочие данные не перезаписываются.
- В конструкторе дополнений вместо текстового пути иконки добавлены визуальный предпросмотр и системный FilePicker; описание стало многострочным, основные поля унифицированы по отступам и размерам. Из личной панели кнопка теперь открывает выбор дополнений для редактирования, а не анкету целиком.
- Убраны интерфейсные блоки общего пула жетонов мастера из виджета аспектов и рабочего центра (старые технические флаги не удаляются, чтобы не повредить исходные данные).
- Заменено видимое действие «Начать повествовательную сцену» на ручное **«Восстановить Волю NPC сцены»**, с выполнением только для NPC текущей карты. Внутренний идентификатор сценовых триггеров сохранён для совместимости.
- Устранён ложный переход «Трекер NPC» в боевой трекер: выбор NPC теперь ведёт к его анкете. Полноценный отдельный менеджер NPC пока не добавлен.
- В линии развития добавлено управление началом/завершением игровой сессии, предложение малой вехи при завершении с проверкой уже выданной малой вехи, вычисление следующего номера сессии. Несколько вех внутри начатой сессии используют один и тот же номер. Дата выдачи сохраняется автоматически, отдельная дата в мире необязательная и проверяется по формату ДД.ММ.ГГГГ. Удалена отдельная кнопка мастера вех из панели карты — вход через линию развития.
- Перенесены административные параметры Fate из вкладки текстов/заметок в сворачиваемые GM-настройки, уточнены пресеты плотности интерфейса, скорректирована кнопка закрытия боевого трекера для неподдерживаемых темой пиктограмм.
- Добавлена проверка сохранности связанных с дополнениями записей и ручного восстановления NPC. **67/67** автономных наборов пройдены.

Ограничения preview: кросс-клиентский ручной прогон в Foundry недоступен здесь; общесистемный интерфейс Fate Core Official продолжает существовать независимо от Toolkit; отдельная полноценная таблица всех NPC, сквозное унифицирование окон системы и полный UX-аудит каждого сложного условия конструктора требуют дальнейшего тестирования.
