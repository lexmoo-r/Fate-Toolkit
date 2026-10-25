(() => {
  const CORE_SKILLS = Object.freeze({
    athletics: "Атлетика", burglary: "Воровство", contacts: "Связи", crafts: "Ремесло",
    deceive: "Обман", drive: "Вождение", empathy: "Эмпатия", fight: "Драка",
    investigate: "Расследование", lore: "Знания", notice: "Внимательность", physique: "Телосложение",
    provoke: "Провокация", rapport: "Взаимопонимание", resources: "Ресурсы", shoot: "Стрельба",
    stealth: "Скрытность", will: "Воля"
  });
  const SYSTEM_TERMS = Object.freeze({
    none: "Нет",
    special: "Особый",
    legendary: "Легендарный",
    epic: "Эпический",
    fantastic: "Фантастический",
    superb: "Великолепный",
    great: "Отличный",
    good: "Хороший",
    fair: "Неплохой",
    average: "Средний",
    mediocre: "Посредственный",
    poor: "Плохой",
    terrible: "Ужасный",
    "high concept": "Высокая концепция",
    trouble: "Проблема",
    "third aspect": "Третий аспект",
    "fourth aspect": "Четвёртый аспект",
    "fifth aspect": "Пятый аспект",
    stress: "Стресс",
    "physical stress": "Физический стресс",
    "mental stress": "Ментальный стресс",
    consequence: "Последствие",
    "mild consequence": "Лёгкое последствие",
    "moderate consequence": "Среднее последствие",
    "severe consequence": "Тяжёлое последствие",
    "extreme consequence": "Экстремальное последствие",
    combat: "Конфликт",
    other: "Прочее"
  });

  const RESULT_RANKS = Object.freeze({
    legendary: "Легендарно",
    epic: "Эпически",
    fantastic: "Фантастически",
    superb: "Великолепно",
    great: "Отлично",
    good: "Хорошо",
    fair: "Неплохо",
    average: "Средне",
    mediocre: "Посредственно",
    poor: "Плохо",
    terrible: "Ужасно"
  });

  const SYSTEM_ANNOTATION_ALIASES = Object.freeze({
    PaidInvoke: ["Paid Invoke"],
    FreeInvokes: ["Free Invokes"],
    FreeInvokeReroll: ["Free Invoke Reroll"],
    PaidInvokeReroll: ["Paid Invoke Reroll"],
    PlusOne: ["+1"]
  });

  const key = value => String(value ?? "").trim().toLocaleLowerCase("ru-RU");
  function skill(value) { return CORE_SKILLS[key(value)] ?? String(value ?? ""); }
  function term(value) { return SYSTEM_TERMS[key(value)] ?? String(value ?? ""); }
  function rank(value) { return RESULT_RANKS[key(value)] ?? String(value ?? ""); }
  function aliases(name) { return [...(SYSTEM_ANNOTATION_ALIASES[name] ?? [])]; }

  globalThis.FateToolkitI18n = Object.freeze({ skill, term, rank, aliases, CORE_SKILLS, SYSTEM_TERMS, RESULT_RANKS });
})();
