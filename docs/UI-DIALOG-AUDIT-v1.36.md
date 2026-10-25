# UI Dialog Audit — v1.36

Цель: довести временные `DialogV2` до того же качества, что постоянные окна Toolkit, не меняя Fate-логику и transport/state contracts.

## Проверенные поверхности

| Поверхность | Главная задача | Результат |
| --- | --- | --- |
| GM opposition | быстро понять действие и назначить способ оппозиции | summary → mode → target/skill/stunts → privacy → resolve |
| Player opposition | быстро выбрать ответ на чужое действие | action summary → skill → stunts → roll/decline |
| Defend | дать контекст защиты без перегруза | defended-against → optional Create subtype → skill/stunts |
| Skill/Stunt picker | минимизировать поиск и ложное авто-применение | search + grouped skills + explicit stunt confirmation |
| Create Advantage | один очевидный смысловой выбор | existing aspect / new aspect |
| Overcome | безопасное подтверждение разрушительного действия | отдельный confirmation surface с icon cue |
| Create Aspect / Boost | короткий post-result flow | одно поле + contextual resource hint + primary action |
| Roll request / Sound settings | постоянные utility windows | локализованы и визуально синхронизированы с DialogV2 |

## Зафиксированные правила

1. Временный диалог не начинается с длинной инструкции: сначала summary или главный выбор.
2. Один визуально доминирующий primary action; reject/decline остаётся вторичным.
3. Stunts никогда не применяются скрыто: только явные checkbox/select действия пользователя.
4. Search-input всегда имеет `aria-label`.
5. На ширине <=520px кнопки становятся вертикальными, а scroll остаётся внутри длинного списка.
6. High-contrast и reduced-motion режимы поддерживаются так же, как у постоянных окон.
7. Все authored strings динамического UI проходят через RU/EN localization boundary.
8. UI-pass не меняет form names, data selectors, request serialization, RPC или Fate rules.
