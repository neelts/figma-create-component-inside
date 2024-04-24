const step = 64;

const sortByDepth = (a: SceneNode, b: SceneNode) => a.parent.children.indexOf(a) - b.parent.children.indexOf(b);

const getValidParent = (node: SceneNode) => {
	let parent = node.parent;
	while (parent) {
		if (parent.type == "INSTANCE" || parent.type == "COMPONENT" || parent.type == "COMPONENT_SET") return parent;
		parent = parent.parent;
	}
	return null;
}

const isAutoLayout = (node: BaseNode & ChildrenMixin) => {
	const al = node as AutoLayoutMixin;
	return (al.layoutMode && al.layoutMode != "NONE") || (al.layoutWrap && al.layoutWrap == "WRAP");
}

const selection = figma.currentPage.selection;

let note = null;

const select = [];

if (selection.length > 0) {

	const instances: string[] = [];

	const groups: Map<string, SceneNode[]> = new Map();
	const positions: Map<string, { x: number, y: number }> = new Map();

	selection.forEach(node => {
		const pn = node.parent.id;
		const sets = groups.has(pn) ? groups.get(pn) : groups.set(pn, []).get(pn);
		sets.push(node);
	});

	groups.forEach(nodes => {

		nodes.sort(sortByDepth);

		const [first] = nodes;

		const validParent = getValidParent(first);
		if (validParent?.type == "INSTANCE") {
			instances.push(validParent.name);
			return;
		}

		let posParent = (validParent ?? first.parent) as SceneNode;
		
		let parent = validParent?.parent ?? first.parent;
		if (parent.type == "COMPONENT_SET") {
			posParent = parent as SceneNode;
			parent = parent.parent;
		}

		if (posParent && !positions.has(posParent.id)) {
			positions.set(posParent.id, {x: posParent.x + posParent.width + step, y: posParent.y});
		}

		const nodeParent = first.parent as SceneNode & ChildrenMixin;
		let groupSaver: RectangleNode;
		if (nodeParent.type == "GROUP") {
			groupSaver = figma.createRectangle();
			groupSaver.resize(0.01, 0.01);
			nodeParent.appendChild(groupSaver);
		}

		nodes.forEach(node => {
			if (!validParent) {
				if (node.type == "COMPONENT" || node.type == "COMPONENT_SET")
				{
					note = `Cannot create a component from a ${node.type == "COMPONENT" ? "component" : "component set"}.`;
					return;
				}
				figma.createComponentFromNode(node);
				return;
			}
			const alParent = nodeParent as AutoLayoutMixin;
			let component: ComponentNode;
			const settings: Vector & ConstraintMixin = {
				x: node.x,
				y: node.y,
				constraints: (node as ConstraintMixin).constraints,
			};
			const rotation = (node as LayoutMixin).rotation;
			(node as LayoutMixin).rotation = 0;
			if (alParent.layoutMode != "NONE" || alParent.layoutWrap == "WRAP") {
				const alChild = node as AutoLayoutChildrenMixin;
				const alSettings: AutoLayoutChildrenMixin = {
					layoutAlign: alChild.layoutAlign,
					layoutGrow: alChild.layoutGrow,
					layoutPositioning: alChild.layoutPositioning,
				};
				parent.appendChild(node);
				component = figma.createComponentFromNode(node);
				const instance = component.createInstance();
				nodeParent.appendChild(instance);
				instance.layoutAlign = alSettings.layoutAlign;
				instance.layoutGrow = alSettings.layoutGrow;
				instance.layoutPositioning = alSettings.layoutPositioning;
				if (instance.layoutPositioning == "ABSOLUTE") {
					instance.x = settings.x;
					instance.y = settings.y;
					if (settings.constraints)
						instance.constraints = settings.constraints;
				}
				instance.rotation = rotation;
			} else {
				parent.appendChild(node);
				component = figma.createComponentFromNode(node);
				const instance = component.createInstance();
				nodeParent.appendChild(instance);
				instance.x = settings.x;
				instance.y = settings.y;
				if (settings.constraints)
					instance.constraints = settings.constraints;
				instance.rotation = rotation;
			}

			parent.insertChild(parent.children.indexOf(posParent) + 1, component);
			if (!isAutoLayout(parent)) {
				const pos = positions.get(posParent.id);
				component.x = pos.x;
				component.y = pos.y;
				pos.x += component.width + step;
			}

			select.push(component);
		});

		if (groupSaver) {
			groupSaver.remove();
		}
	});

	if (instances.length > 0) {
		const instanceNames = instances.join(", ");
		note = `Skipping node${instances.length > 1 ? `s "${instanceNames}"` : ` "${instanceNames}"`} inside an instance, try again in the main component.`;
	}
}

if (note) figma.notify(note, {timeout: note.length * 50});

if (select.length > 0) figma.currentPage.selection = select;

figma.closePlugin();
