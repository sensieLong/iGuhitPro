
// =====================================================
// iGuhit Advanced Vector Features Addon
// =====================================================

// -----------------------------
// PATHFINDER PANEL
// -----------------------------
window.pathfinder = {
    unite() {
        const items = getSelectedDrawItems().filter(i => i instanceof paper.PathItem);
        if (items.length < 2) return;

        let result = items[0];

        for (let i = 1; i < items.length; i++) {
            result = result.unite(items[i]);
        }

        items.forEach(i => {
            if (i !== result) i.remove();
        });

        result.selected = true;
        saveState();
        paper.view.draw();
    },

    subtract() {
        const items = getSelectedDrawItems().filter(i => i instanceof paper.PathItem);
        if (items.length < 2) return;

        let result = items[0];

        for (let i = 1; i < items.length; i++) {
            result = result.subtract(items[i]);
        }

        items.forEach(i => {
            if (i !== result) i.remove();
        });

        result.selected = true;
        saveState();
        paper.view.draw();
    },

    intersect() {
        const items = getSelectedDrawItems().filter(i => i instanceof paper.PathItem);
        if (items.length < 2) return;

        let result = items[0];

        for (let i = 1; i < items.length; i++) {
            result = result.intersect(items[i]);
        }

        items.forEach(i => {
            if (i !== result) i.remove();
        });

        result.selected = true;
        saveState();
        paper.view.draw();
    },

    exclude() {
        const items = getSelectedDrawItems().filter(i => i instanceof paper.PathItem);
        if (items.length < 2) return;

        let result = items[0];

        for (let i = 1; i < items.length; i++) {
            result = result.exclude(items[i]);
        }

        items.forEach(i => {
            if (i !== result) i.remove();
        });

        result.selected = true;
        saveState();
        paper.view.draw();
    }
};

// -----------------------------
// OFFSET PATH
// -----------------------------
window.offsetSelectedPath = function(offset = 10) {
    const items = getSelectedDrawItems();

    items.forEach(item => {
        try {
            const clone = item.clone();
            const scaleFactor = 1 + (offset / 100);

            clone.scale(scaleFactor);

            clone.strokeColor = item.strokeColor;
            clone.fillColor = item.fillColor;

            clone.selected = true;
        } catch (e) {
            console.warn(e);
        }
    });

    saveState();
    paper.view.draw();
};

// -----------------------------
// EXPAND APPEARANCE
// -----------------------------
window.expandAppearance = function() {
    const items = getSelectedDrawItems();

    items.forEach(item => {
        try {
            item.flatten(2);
            item.simplify(2);
        } catch (e) {
            console.warn(e);
        }
    });

    saveState();
    paper.view.draw();
};

// -----------------------------
// LIVE CORNERS
// -----------------------------
window.liveCorners = function(radius = 12) {
    const items = getSelectedDrawItems();

    items.forEach(item => {
        if (!(item instanceof paper.Path)) return;

        try {
            item.smooth({ type: 'continuous' });
            item.strokeJoin = 'round';
        } catch (e) {
            console.warn(e);
        }
    });

    saveState();
    paper.view.draw();
};

// -----------------------------
// BLOB BRUSH
// -----------------------------
let blobBrushPath = null;

window.enableBlobBrush = function() {
    state.activeToolName = 'blob-brush';
};

function handleBlobBrushMouseDown(event) {
    blobBrushPath = new paper.Path.Circle({
        center: event.point,
        radius: state.strokeWidth * 2,
        fillColor: state.strokeColor
    });
}

function handleBlobBrushMouseDrag(event) {
    const blob = new paper.Path.Circle({
        center: event.point,
        radius: state.strokeWidth * 2,
        fillColor: state.strokeColor
    });

    blobBrushPath = blobBrushPath.unite(blob);
    blob.remove();

    paper.view.draw();
}

function handleBlobBrushMouseUp(event) {
    blobBrushPath.selected = true;
    saveState();
}

// -----------------------------
// SHAPE BOOLEAN PREVIEW
// -----------------------------
let booleanPreview = null;

window.previewBoolean = function(type = 'unite') {
    const items = getSelectedDrawItems().filter(i => i instanceof paper.PathItem);

    if (items.length < 2) return;

    if (booleanPreview) {
        booleanPreview.remove();
    }

    let result = items[0].clone({ insert: false });

    for (let i = 1; i < items.length; i++) {
        if (type === 'unite') {
            result = result.unite(items[i], { insert: false });
        } else if (type === 'subtract') {
            result = result.subtract(items[i], { insert: false });
        } else if (type === 'intersect') {
            result = result.intersect(items[i], { insert: false });
        }
    }

    booleanPreview = result;

    booleanPreview.fillColor = new paper.Color(0.2, 0.6, 1, 0.3);
    booleanPreview.strokeColor = '#4a90e2';
    booleanPreview.dashArray = [8, 4];
    booleanPreview.guide = true;

    paper.view.draw();
};

console.log('Advanced Vector Addon Loaded');
