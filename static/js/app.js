let currentViewMode = "id";
let selectedHighlight = { mode: null, key: null };
let highlightedRows = new Set();
let svg;
let viewport;
let previousPositions = new Map();

const STAGE_MARGIN = { top: 56, right: 90, bottom: 56, left: 90 };
const DURATION = 480;
const MAX_LOG_ITEMS = 3;

function normalizeKey(value) {
    return String(value ?? "").trim().toLowerCase();
}

function showStatus(message, type = "idle") {
    const status = document.getElementById("action-status");
    status.textContent = message;
    status.className = `action-status ${type}`;
}

function showModal(message, title = "Notification") {
    const overlay = document.getElementById("modal-overlay");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
}

function hideModal() {
    const overlay = document.getElementById("modal-overlay");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
}

function setOperationBadge(label) {
    document.getElementById("operation-badge").textContent = label;
}

function addLog(message) {
    const logBox = document.getElementById("log-box");
    const time = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const entry = document.createElement("p");
    entry.textContent = `[${time}] ${message}`;
    logBox.prepend(entry);

    while (logBox.children.length > MAX_LOG_ITEMS) {
        logBox.removeChild(logBox.lastElementChild);
    }
}

function setResultContent(html) {
    document.getElementById("search-result-box").innerHTML = html;
}

function studentRowsTable(students) {
    const rows = students.map(student => `
        <tr>
            <td>${student.student_id}</td>
            <td>${student.full_name}</td>
            <td>${student.gender}</td>
            <td>${student.class_name}</td>
        </tr>
    `).join("");

    return `
        <table>
            <thead>
                <tr>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Gender</th>
                    <th>Class</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadStudents() {
    const response = await fetch("/api/students");
    const students = await response.json();
    const tableBody = document.getElementById("student-table-body");
    const rowCountBadge = document.getElementById("row-count-badge");

    rowCountBadge.textContent = `${students.length} rows`;
    tableBody.innerHTML = students.map(student => `
        <tr class="${highlightedRows.has(student.student_id) ? "row-highlight" : ""}">
            <td>${student.student_id}</td>
            <td>${student.full_name}</td>
            <td>${student.gender}</td>
            <td>${student.class_name}</td>
        </tr>
    `).join("");
}

function wrapKeyText(label, maxChars = 14) {
    const words = String(label).split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxChars) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }

    if (current) lines.push(current);
    return lines.slice(0, 3);
}

function computeNodeVisual(nodeData) {
    const rawKeys = nodeData.raw_keys || nodeData.keys || [];
    const visualKeys = nodeData.keys || [];

    const keys = visualKeys.map((visualKey, index) => {
        const lines = wrapKeyText(visualKey, currentViewMode === "name" ? 13 : 18);
        const maxLineLength = Math.max(...lines.map(line => line.length), 6);
        const width = Math.max(currentViewMode === "name" ? 126 : 96, Math.min(196, 28 + maxLineLength * 9));
        const height = Math.max(38, 18 + lines.length * 18);

        return {
            rawKey: rawKeys[index] ?? visualKey,
            visualKey,
            lines,
            width,
            height,
        };
    });

    const boxWidth = keys.reduce((sum, key) => sum + key.width, 0) + Math.max(0, keys.length - 1) * 10 + 22;
    const contentHeight = keys.length > 0 ? Math.max(...keys.map(key => key.height)) : 38;

    return {
        keys,
        boxWidth,
        boxHeight: contentHeight + 16,
    };
}

function prepareTreeData(node, depth = 0, lineage = "root") {
    if (!node) return null;

    const visual = computeNodeVisual(node);
    const rawKeys = (node.raw_keys || node.keys || []).map(key => normalizeKey(key));
    const nodeId = `${lineage}|${depth}|${rawKeys.join("~") || "empty"}`;
    const children = (node.children || []).map((child, index) => prepareTreeData(child, depth + 1, `${nodeId}.${index}`)).filter(Boolean);

    return {
        ...node,
        ...visual,
        nodeId,
        children,
    };
}

function subtreePixelWidth(node) {
    const gap = currentViewMode === "name" ? 42 : 34;

    if (!node.children || node.children.length === 0) {
        return node.boxWidth;
    }

    const childrenWidth = node.children.reduce((sum, child) => sum + subtreePixelWidth(child), 0) + gap * (node.children.length - 1);
    return Math.max(node.boxWidth, childrenWidth);
}

function buildHierarchy(node) {
    const root = d3.hierarchy(node, datum => datum.children || []);
    root.each(datum => {
        datum.data.subtreeWidth = subtreePixelWidth(datum.data);
    });
    return root;
}

function countTreeNodes(node) {
    if (!node) return 0;
    const children = Array.isArray(node.children) ? node.children : [];
    return 1 + children.reduce((total, child) => total + countTreeNodes(child), 0);
}

function isHighlighted(rawKey) {
    return selectedHighlight.mode === currentViewMode && normalizeKey(selectedHighlight.key) === normalizeKey(rawKey);
}

function elbowPath(link) {
    const sourceY = link.source.y + link.source.data.boxHeight / 2;
    const targetY = link.target.y - link.target.data.boxHeight / 2;

    return `M ${link.source.x} ${sourceY} L ${link.target.x} ${targetY}`;
}

function createSvgIfNeeded(width, height) {
    if (!svg) {
        svg = d3.select("#btree-stage")
            .append("svg")
            .attr("class", "btree-svg");
        viewport = svg.append("g");
        viewport.append("g").attr("class", "links");
        viewport.append("g").attr("class", "nodes");
    }

    svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
}

function renderTreeD3(treeData) {
    const stage = document.getElementById("btree-stage");

    if (!treeData || ((!treeData.keys || treeData.keys.length === 0) && (!treeData.children || treeData.children.length === 0))) {
        stage.innerHTML = `<div class="loading-state">Tree is empty.</div>`;
        svg = null;
        viewport = null;
        previousPositions = new Map();
        return;
    }

    if (!svg) {
        stage.innerHTML = "";
    }

    const preparedRootData = prepareTreeData(treeData);
    const root = buildHierarchy(preparedRootData);
    const dx = currentViewMode === "name" ? 170 : 138;
    const dy = currentViewMode === "name" ? 290 : 240;

    d3.tree()
        .nodeSize([dx, dy])
        .separation((a, b) => {
            const widthA = (a.data.subtreeWidth || 120) / 120;
            const widthB = (b.data.subtreeWidth || 120) / 120;
            return (a.parent === b.parent ? 1.25 : 1.45) * (widthA + widthB) / 2;
        })(root);

    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    root.each(datum => {
        minX = Math.min(minX, datum.x - datum.data.boxWidth / 2);
        maxX = Math.max(maxX, datum.x + datum.data.boxWidth / 2);
        maxY = Math.max(maxY, datum.y + datum.data.boxHeight / 2);
    });

    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY, 1);
    const stageWidth = Math.max(stage.clientWidth - 16, 320);
    const stageHeight = Math.max(stage.clientHeight - 16, 320);
    createSvgIfNeeded(stageWidth, stageHeight);

    const availableWidth = Math.max(stageWidth - STAGE_MARGIN.left - STAGE_MARGIN.right, 120);
    const availableHeight = Math.max(stageHeight - STAGE_MARGIN.top - STAGE_MARGIN.bottom, 120);
    const scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
    const offsetX = (stageWidth - contentWidth * scale) / 2 - minX * scale;
    const offsetY = Math.max(28, (stageHeight - contentHeight * scale) / 2);
    viewport.transition().duration(DURATION).attr("transform", `translate(${offsetX}, ${offsetY}) scale(${scale})`);

    const nodesLayer = viewport.select(".nodes");
    const linksLayer = viewport.select(".links");
    const nodes = root.descendants();
    const links = root.links();

    const nodeSelection = nodesLayer
        .selectAll("g.tree-node")
        .data(nodes, datum => datum.data.nodeId);

    const nodeEnter = nodeSelection.enter()
        .append("g")
        .attr("class", "tree-node")
        .attr("transform", datum => {
            const previous = previousPositions.get(datum.parent?.data.nodeId || datum.data.nodeId) || { x: datum.x, y: 0 };
            return `translate(${previous.x},${previous.y})`;
        })
        .style("opacity", 0);

    nodeEnter.append("rect").attr("class", "d3-node-outer");

    const mergedNodes = nodeEnter.merge(nodeSelection);

    mergedNodes.each(function (datum) {
        const node = d3.select(this);
        const hasNodeHighlight = datum.data.keys.some(key => isHighlighted(key.rawKey));

        node.select("rect.d3-node-outer")
            .attr("class", `d3-node-outer ${hasNodeHighlight ? "node-highlight" : ""}`)
            .attr("x", -datum.data.boxWidth / 2)
            .attr("y", -datum.data.boxHeight / 2)
            .attr("width", datum.data.boxWidth)
            .attr("height", datum.data.boxHeight)
            .attr("rx", 16)
            .attr("ry", 16);

        const keySelection = node.selectAll("g.key-group")
            .data(datum.data.keys, keyDatum => normalizeKey(keyDatum.rawKey));

        const keyEnter = keySelection.enter()
            .append("g")
            .attr("class", "key-group");

        keyEnter.append("rect").attr("class", "d3-key-pill");
        keyEnter.append("text").attr("class", "d3-key-text");

        let currentX = -datum.data.boxWidth / 2 + 11;
        keyEnter.merge(keySelection).each(function (keyDatum) {
            const keyGroup = d3.select(this);
            const highlighted = isHighlighted(keyDatum.rawKey);

            keyGroup.select("rect")
                .attr("class", `d3-key-pill ${highlighted ? "key-highlight" : ""}`)
                .attr("x", currentX)
                .attr("y", -keyDatum.height / 2)
                .attr("width", keyDatum.width)
                .attr("height", keyDatum.height)
                .attr("rx", 12)
                .attr("ry", 12);

            const text = keyGroup.select("text")
                .attr("x", currentX + keyDatum.width / 2)
                .attr("y", 0);

            const lineHeight = 16;
            const startY = -((keyDatum.lines.length - 1) * lineHeight) / 2;
            const tspanSelection = text.selectAll("tspan").data(keyDatum.lines);

            tspanSelection.enter().append("tspan").merge(tspanSelection)
                .attr("x", currentX + keyDatum.width / 2)
                .attr("dy", (_, index) => (index === 0 ? startY : lineHeight))
                .text(line => line);

            tspanSelection.exit().remove();
            currentX += keyDatum.width + 10;
        });

        keySelection.exit().remove();
    });

    mergedNodes.transition()
        .duration(DURATION)
        .style("opacity", 1)
        .attr("transform", datum => `translate(${datum.x},${datum.y})`);

    nodeSelection.exit()
        .transition()
        .duration(DURATION * 0.75)
        .style("opacity", 0)
        .attr("transform", datum => {
            const previous = previousPositions.get(datum.parent?.data.nodeId || datum.data.nodeId) || { x: datum.x, y: datum.y };
            return `translate(${previous.x},${previous.y})`;
        })
        .remove();

    const linkSelection = linksLayer
        .selectAll("path.d3-link")
        .data(links, link => link.target.data.nodeId);

    linkSelection.enter()
        .append("path")
        .attr("class", "d3-link")
        .attr("d", link => {
            const source = previousPositions.get(link.source.data.nodeId) || { x: link.source.x, y: link.source.y };
            const target = previousPositions.get(link.source.data.nodeId) || source;
            return elbowPath({
                source: { ...link.source, x: source.x, y: source.y, data: link.source.data },
                target: { ...link.target, x: target.x, y: target.y, data: link.target.data },
            });
        })
        .merge(linkSelection)
        .transition()
        .duration(DURATION)
        .attr("d", elbowPath);

    linkSelection.exit()
        .transition()
        .duration(DURATION * 0.75)
        .style("opacity", 0)
        .remove();

    previousPositions = new Map(nodes.map(datum => [datum.data.nodeId, { x: datum.x, y: datum.y }]));
}

async function fetchCurrentTree() {
    const endpoint = currentViewMode === "name" ? "/api/index/name-btree" : "/api/index/id-btree";
    const response = await fetch(endpoint);
    return response.json();
}

async function loadTreeView() {
    const title = document.getElementById("visual-title");
    const subtitle = document.getElementById("visual-subtitle");

    if (currentViewMode === "name") {
        title.textContent = "Name Index";
        subtitle.textContent = "";
    } else {
        title.textContent = "ID Index";
        subtitle.textContent = "";
    }

    const tree = await fetchCurrentTree();
    const hasContent = tree && ((tree.keys && tree.keys.length > 0) || (tree.children && tree.children.length > 0));
    const nodeCount = hasContent ? countTreeNodes(tree) : 0;
    subtitle.textContent = `Degree: 3 | Nodes: ${nodeCount}`;
    renderTreeD3(tree);
}

function applyHighlightFromResult(result, preferredMode = currentViewMode) {
    const highlight = result.highlight || {};
    highlightedRows = new Set(highlight.table_student_ids || (highlight.table_student_id ? [highlight.table_student_id] : []));

    if (preferredMode === "name" && highlight.name_key) {
        selectedHighlight = { mode: "name", key: highlight.name_key };
        return;
    }

    if (preferredMode === "id" && highlight.id_key != null) {
        selectedHighlight = { mode: "id", key: highlight.id_key };
        return;
    }

    if (highlight.id_key != null) {
        selectedHighlight = { mode: "id", key: highlight.id_key };
    } else if (highlight.name_key) {
        selectedHighlight = { mode: "name", key: highlight.name_key };
    } else {
        selectedHighlight = { mode: null, key: null };
    }
}

async function addStudent() {
    const payload = {
        student_id: document.getElementById("student-id").value.trim(),
        full_name: document.getElementById("full-name").value.trim(),
        gender: document.getElementById("gender").value,
        class_name: document.getElementById("class-name").value.trim(),
    };

    if (!payload.student_id || !payload.full_name || !payload.class_name) {
        const message = "Please fill in student ID, full name, and class before adding a record.";
        showStatus(message, "error");
        showModal(message, "Missing Information");
        return;
    }

    const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
        showStatus(result.message, "error");
        showModal(result.message, "Insert Failed");
        setOperationBadge("Insert failed");
        return;
    }

    applyHighlightFromResult(result, currentViewMode);
    await loadStudents();
    await loadTreeView();

    document.getElementById("student-id").value = "";
    document.getElementById("full-name").value = "";
    document.getElementById("class-name").value = "";
    document.getElementById("gender").value = "Nam";

    showStatus(result.message, "success");
    setOperationBadge("Insert");
    addLog(`Inserted student ${result.student.student_id}.`);
}

async function deleteStudent() {
    const studentId = document.getElementById("delete-id").value.trim();
    if (!studentId) {
        const message = "Please enter a student ID before deleting.";
        showStatus(message, "error");
        showModal(message, "Missing Information");
        return;
    }

    const response = await fetch(`/api/students/${studentId}`, { method: "DELETE" });
    const result = await response.json();

    if (!response.ok) {
        showStatus(result.message, "error");
        showModal(result.message, "Delete Failed");
        setOperationBadge("Delete failed");
        return;
    }

    applyHighlightFromResult(result, currentViewMode);
    await loadStudents();
    await loadTreeView();

    document.getElementById("delete-id").value = "";
    showStatus(result.message, "success");
    setOperationBadge("Delete");
    addLog(`Deleted student ${result.deleted_student.student_id}.`);
    setResultContent(`<p>Deleted student <strong>${result.deleted_student.student_id}</strong> from the system.</p>`);
}

async function searchStudentById() {
    const studentId = document.getElementById("search-id").value.trim();
    if (!studentId) {
        const message = "Please enter a student ID before searching.";
        showStatus(message, "error");
        showModal(message, "Missing Information");
        return;
    }

    currentViewMode = "id";
    syncViewModeButtons();

    const response = await fetch(`/api/students/search/id/${studentId}`);
    const result = await response.json();

    if (!response.ok) {
        highlightedRows = new Set();
        selectedHighlight = { mode: null, key: null };
        await loadStudents();
        await loadTreeView();
        setResultContent(`<p>No student found for <strong>${studentId}</strong>.</p>`);
        showStatus("No matching record was found.", "error");
        showModal(`Student ID ${studentId} was not found.`, "Search Failed");
        setOperationBadge("Search ID");
        addLog(`Search by student ID ${studentId}: no result.`);
        return;
    }

    applyHighlightFromResult(result, "id");
    await loadStudents();
    await loadTreeView();
    setResultContent(studentRowsTable([result.student]));
    showStatus(result.message, "info");
    setOperationBadge("Search ID");
    addLog(`Search by student ID ${studentId}: match found.`);
}

async function searchStudentsByName() {
    const fullName = document.getElementById("search-name").value.trim();
    if (!fullName) {
        const message = "Please enter a full name before searching.";
        showStatus(message, "error");
        showModal(message, "Missing Information");
        return;
    }

    currentViewMode = "name";
    syncViewModeButtons();

    const response = await fetch(`/api/students/search/name/${encodeURIComponent(fullName)}`);
    const result = await response.json();

    if (!response.ok) {
        highlightedRows = new Set();
        selectedHighlight = { mode: null, key: null };
        await loadStudents();
        await loadTreeView();
        setResultContent(`<p>No student found for <strong>${fullName}</strong>.</p>`);
        showStatus("No matching record was found.", "error");
        showModal(`No student matched the name "${fullName}".`, "Search Failed");
        setOperationBadge("Search name");
        addLog(`Search by full name "${fullName}": no result.`);
        return;
    }

    applyHighlightFromResult(result, "name");
    await loadStudents();
    await loadTreeView();
    setResultContent(studentRowsTable(result.students));
    showStatus(result.message, "info");
    setOperationBadge("Search name");
    addLog(`Search by full name "${fullName}": ${result.students.length} result(s).`);
}

function syncViewModeButtons() {
    document.getElementById("view-id-btn").classList.toggle("active", currentViewMode === "id");
    document.getElementById("view-name-btn").classList.toggle("active", currentViewMode === "name");
}

async function setViewMode(mode) {
    currentViewMode = mode;
    syncViewModeButtons();
    await loadTreeView();
}

async function clearHighlight() {
    highlightedRows = new Set();
    selectedHighlight = { mode: null, key: null };
    await loadStudents();
    await loadTreeView();
    setResultContent("<p>Temporary highlights were cleared.</p>");
    showStatus("Highlight cleared.", "idle");
    setOperationBadge("Clear");
    addLog("Highlights cleared.");
}

window.addEventListener("load", async () => {
    await loadStudents();
    await loadTreeView();

    document.getElementById("add-student-btn").addEventListener("click", addStudent);
    document.getElementById("delete-student-btn").addEventListener("click", deleteStudent);
    document.getElementById("search-student-btn").addEventListener("click", searchStudentById);
    document.getElementById("search-name-btn").addEventListener("click", searchStudentsByName);
    document.getElementById("refresh-btn").addEventListener("click", async () => {
        await loadStudents();
        await loadTreeView();
        showStatus("Data and tree were refreshed.", "idle");
        setOperationBadge("Refresh");
        addLog("Data refreshed.");
    });
    document.getElementById("clear-highlight-btn").addEventListener("click", clearHighlight);
    document.getElementById("view-id-btn").addEventListener("click", () => setViewMode("id"));
    document.getElementById("view-name-btn").addEventListener("click", () => setViewMode("name"));
    document.getElementById("modal-close-btn").addEventListener("click", hideModal);
    document.getElementById("modal-ok-btn").addEventListener("click", hideModal);
    document.getElementById("modal-overlay").addEventListener("click", event => {
        if (event.target.id === "modal-overlay") {
            hideModal();
        }
    });
});

window.addEventListener("resize", () => {
    loadTreeView();
});
