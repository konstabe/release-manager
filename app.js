const STATUS_OPTIONS = ["new", "testing", "done"];
const VALID_TYPES = ["admin", "website", "android", "ios"];
const AUTH_LOGIN = "admin";
const AUTH_EMAIL = "admin2@release-manager.local";

const TYPE_LABELS = {
  admin: "Админка",
  website: "Сайт",
  android: "Android",
  ios: "iOS",
};

const STATUS_LABELS = {
  new: "Новый",
  testing: "Тестирование",
  done: "Готово",
};

const TYPE_TO_STREAM = {
  admin: "web",
  website: "web",
  android: "mobile",
  ios: "mobile",
};

const TESTERS = {
  web: ["Белов", "Беляков", "Бутурлин", "Власов", "Козачук", "Колоколин", "Кудрявцев", "Машков", "Чураев"],
  mobile: ["Белов", "Козачук", "Чураев"],
};

const state = {
  releases: [],
  supabase: null,
  channel: null,
  session: null,
};

function getSupabaseConfig() {
  const config = window.APP_CONFIG || {};
  return {
    url: String(config.supabaseUrl || "").trim(),
    anonKey: String(config.supabaseAnonKey || "").trim(),
  };
}

function isConfigReady() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey && !url.includes("YOUR_") && !anonKey.includes("YOUR_"));
}

function formatType(type) {
  return TYPE_LABELS[type] || type || "";
}

function formatStatus(status) {
  return STATUS_LABELS[status] || status || "";
}

function getStreamForType(type) {
  return TYPE_TO_STREAM[type] || null;
}

function getTesterGroup(stream) {
  return (TESTERS[stream] || []).slice().sort((left, right) => left.localeCompare(right, "ru"));
}

function getReleasesByStream(releases, stream) {
  return releases.filter((release) => getStreamForType(release.type) === stream);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function findTesterInGroup(type, assignedTester) {
  const stream = getStreamForType(type);
  return getTesterGroup(stream).find(
    (tester) => normalizeName(tester) === normalizeName(assignedTester)
  );
}

function getNextTesterWithSkips(releases, type, skips = []) {
  const stream = getStreamForType(type);
  const testers = getTesterGroup(stream);
  if (!stream || testers.length === 0) {
    return null;
  }

  let lastTester = null;
  for (let index = releases.length - 1; index >= 0; index -= 1) {
    const release = releases[index];
    if (getStreamForType(release.type) === stream) {
      lastTester = release.assignedTester;
      break;
    }
  }

  const skipSet = new Set((skips || []).map(normalizeName));
  let startIndex = 0;

  if (lastTester) {
    const lastIndex = testers.findIndex(
      (tester) => normalizeName(tester) === normalizeName(lastTester)
    );
    if (lastIndex !== -1) {
      startIndex = (lastIndex + 1) % testers.length;
    }
  }

  for (let offset = 0; offset < testers.length; offset += 1) {
    const candidate = testers[(startIndex + offset) % testers.length];
    if (!skipSet.has(normalizeName(candidate))) {
      return candidate;
    }
  }

  return null;
}

function askTesterAvailability(tester) {
  const modal = document.getElementById("availability-modal");
  const name = document.getElementById("modal-tester-name");
  const yesButton = document.getElementById("modal-yes");
  const noButton = document.getElementById("modal-no");

  return new Promise((resolve) => {
    name.textContent = tester;
    modal.classList.remove("hidden");

    const cleanup = () => {
      modal.classList.add("hidden");
      yesButton.removeEventListener("click", onYes);
      noButton.removeEventListener("click", onNo);
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };

    const onNo = () => {
      cleanup();
      resolve(false);
    };

    yesButton.addEventListener("click", onYes);
    noButton.addEventListener("click", onNo);
  });
}

async function pickTester(type) {
  const skips = [];
  while (true) {
    const tester = getNextTesterWithSkips(state.releases, type, skips);
    if (!tester) {
      return null;
    }

    const confirmed = await askTesterAvailability(tester);
    if (confirmed) {
      return tester;
    }

    skips.push(tester);
  }
}

function createCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function renderReleases(stream, releases) {
  const target = document.getElementById(`${stream}-releases`);
  target.innerHTML = "";
  const testers = getTesterGroup(stream);

  if (!releases.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-state";
    cell.textContent = "Релизов пока нет.";
    row.appendChild(cell);
    target.appendChild(row);
    return;
  }

  releases.forEach((release) => {
    const row = document.createElement("tr");
    row.appendChild(createCell(release.title));
    row.appendChild(createCell(release.date || ""));
    row.appendChild(createCell(formatType(release.type)));

    const testerCell = document.createElement("td");
    const testerSelect = document.createElement("select");
    testerSelect.className = "tester-select";
    testerSelect.dataset.id = String(release.id);
    testerSelect.dataset.stream = stream;

    testers.forEach((tester) => {
      const optionElement = document.createElement("option");
      optionElement.value = tester;
      optionElement.textContent = tester;
      optionElement.selected = tester === release.assignedTester;
      testerSelect.appendChild(optionElement);
    });

    testerCell.appendChild(testerSelect);
    row.appendChild(testerCell);

    const statusCell = document.createElement("td");
    const select = document.createElement("select");
    select.className = "status-select";
    select.dataset.id = String(release.id);

    STATUS_OPTIONS.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option;
      optionElement.textContent = formatStatus(option);
      optionElement.selected = option === release.status;
      select.appendChild(optionElement);
    });

    statusCell.appendChild(select);
    row.appendChild(statusCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "table-actions";
    const deleteButton = document.createElement("button");
    deleteButton.className = "link-button";
    deleteButton.type = "button";
    deleteButton.dataset.id = String(release.id);
    deleteButton.dataset.action = "delete-release";
    deleteButton.textContent = "Удалить";
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    target.appendChild(row);
  });
}

function renderAll() {
  renderReleases("web", getReleasesByStream(state.releases, "web"));
  renderReleases("mobile", getReleasesByStream(state.releases, "mobile"));
}

function renderError(message) {
  ["web", "mobile"].forEach((stream) => {
    const target = document.getElementById(`${stream}-releases`);
    target.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-state";
    cell.textContent = message;
    row.appendChild(cell);
    target.appendChild(row);
  });
}

function showSetupBanner() {
  document.getElementById("setup-banner").classList.remove("hidden");
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("logout-button").classList.add("hidden");
}

function showAppShell() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("logout-button").classList.remove("hidden");
}

function getSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  return window.supabase.createClient(url, anonKey);
}

async function fetchReleases() {
  const { data, error } = await state.supabase
    .from("releases")
    .select("id, title, type, date, assigned_tester, status, created_at")
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  state.releases = (data || []).map((release) => ({
    id: release.id,
    title: release.title,
    type: release.type,
    date: release.date,
    assignedTester: release.assigned_tester,
    status: release.status,
    createdAt: release.created_at,
  }));
}

async function refresh() {
  await fetchReleases();
  renderAll();
}

function initRealtime() {
  if (state.channel) {
    state.supabase.removeChannel(state.channel);
  }

  state.channel = state.supabase
    .channel("public:releases")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "releases" },
      async () => {
        try {
          await refresh();
        } catch (error) {
          renderError(error.message);
        }
      }
    )
    .subscribe();
}

function stopRealtime() {
  if (!state.channel) {
    return;
  }

  state.supabase.removeChannel(state.channel);
  state.channel = null;
}

async function createRelease({ title, type, date, assignedTester }) {
  const normalizedType = String(type || "").trim().toLowerCase();
  if (!VALID_TYPES.includes(normalizedType)) {
    throw new Error("Некорректный тип релиза.");
  }

  const resolvedTester = findTesterInGroup(normalizedType, assignedTester);
  if (!resolvedTester) {
    throw new Error("Некорректный тестировщик.");
  }

  const payload = {
    title: String(title || "").trim() || "Untitled release",
    type: normalizedType,
    date: date || new Date().toISOString().slice(0, 10),
    assigned_tester: resolvedTester,
    status: "new",
  };

  const { error } = await state.supabase.from("releases").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

async function updateStatus(id, status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!STATUS_OPTIONS.includes(normalizedStatus)) {
    throw new Error("Некорректный статус.");
  }

  const { error } = await state.supabase
    .from("releases")
    .update({ status: normalizedStatus })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAssignedTester(id, type, assignedTester) {
  const resolvedTester = findTesterInGroup(type, assignedTester);
  if (!resolvedTester) {
    throw new Error("Некорректный тестировщик.");
  }

  const { error } = await state.supabase
    .from("releases")
    .update({ assigned_tester: resolvedTester })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

async function deleteRelease(id) {
  const { error } = await state.supabase.from("releases").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.target;
      tabs.forEach((item) => item.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));

      tab.classList.add("active");
      document.getElementById(`panel-${target}`).classList.add("active");
    });
  });
}

function initAuthForm() {
  const form = document.getElementById("login-form");
  const logoutButton = document.getElementById("logout-button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const login = String(data.get("login") || "").trim();
    const password = String(data.get("password") || "");

    try {
      if (login !== AUTH_LOGIN) {
        throw new Error("Неверный логин.");
      }

      const { data: authData, error } = await state.supabase.auth.signInWithPassword({
        email: AUTH_EMAIL,
        password,
      });

      if (error) {
        throw error;
      }

      state.session = authData.session || null;
      form.reset();
      await enterAuthenticatedMode();
    } catch (error) {
      alert(error.message || "Не удалось войти.");
    }
  });

  logoutButton.addEventListener("click", async () => {
    const { error } = await state.supabase.auth.signOut();
    if (error) {
      alert(error.message || "Не удалось выйти.");
      return;
    }

    state.session = null;
    state.releases = [];
    stopRealtime();
    showAuthScreen();
  });
}

function initForms() {
  document.querySelectorAll("[data-action='toggle-form']").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.querySelector(`.panel[data-stream='${button.dataset.stream}']`);
      panel.querySelector(".release-form").classList.toggle("hidden");
    });
  });

  document.querySelectorAll(".release-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const type = data.get("type");

      try {
        const tester = await pickTester(type);
        if (!tester) {
          alert("Нет доступных тестировщиков.");
          return;
        }

        await createRelease({
          title: data.get("title"),
          type,
          date: data.get("date"),
          assignedTester: tester,
        });

        form.reset();
        form.classList.add("hidden");
        await refresh();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function initTableActions() {
  document.addEventListener("change", async (event) => {
    if (event.target.matches(".tester-select")) {
      const release = state.releases.find((item) => item.id === Number(event.target.dataset.id));
      if (!release) {
        await refresh();
        return;
      }

      try {
        await updateAssignedTester(release.id, release.type, event.target.value);
        await refresh();
      } catch (error) {
        alert(error.message);
        await refresh();
      }
      return;
    }

    if (!event.target.matches(".status-select")) {
      return;
    }

    try {
      await updateStatus(Number(event.target.dataset.id), event.target.value);
      await refresh();
    } catch (error) {
      alert(error.message);
      await refresh();
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='delete-release']");
    if (!button) {
      return;
    }

    if (!window.confirm("Удалить этот релиз?")) {
      return;
    }

    try {
      await deleteRelease(Number(button.dataset.id));
      await refresh();
    } catch (error) {
      alert(error.message);
    }
  });
}

async function enterAuthenticatedMode() {
  showAppShell();
  initRealtime();

  try {
    await refresh();
  } catch (error) {
    renderError(error.message);
  }
}

async function init() {
  if (!isConfigReady()) {
    showSetupBanner();
    renderError("Заполни config.js, чтобы подключиться к Supabase.");
    return;
  }

  state.supabase = getSupabaseClient();
  initTabs();
  initAuthForm();
  initForms();
  initTableActions();
  showAuthScreen();

  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    renderError(error.message);
    return;
  }

  state.session = data.session || null;

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session || null;

    if (!state.session) {
      state.releases = [];
      stopRealtime();
      showAuthScreen();
      return;
    }

    await enterAuthenticatedMode();
  });

  if (state.session) {
    await enterAuthenticatedMode();
  }
}

init();
