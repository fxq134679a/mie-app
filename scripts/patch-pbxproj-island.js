// 一次性脚本：把 IslandWidget 扩展 target 写进 ios/App/App.xcodeproj/project.pbxproj
const fs = require('fs');
const P = 'D:/A/html/mie-app/ios/App/App.xcodeproj/project.pbxproj';
let s = fs.readFileSync(P, 'utf8');

const ID = {
  PRODUCT: 'C7AB00000000000000000001',
  GROUP: 'C7AB00000000000000000002',
  FR_BUNDLE: 'C7AB00000000000000000003',
  FR_WIDGET: 'C7AB00000000000000000004',
  FR_ATTR: 'C7AB00000000000000000005',
  FR_STATES: 'C7AB00000000000000000006',
  FR_FRAMES: 'C7AB00000000000000000007',
  FR_FONTS: 'C7AB00000000000000000008',
  FR_INFO: 'C7AB00000000000000000009',
  BF_BUNDLE: 'C7AB0000000000000000000A',
  BF_WIDGET: 'C7AB0000000000000000000B',
  BF_ATTR_W: 'C7AB0000000000000000000C',
  BF_STATES: 'C7AB0000000000000000000D',
  BF_FRAMES: 'C7AB0000000000000000000E',
  BF_FONTS: 'C7AB0000000000000000000F',
  FR_PLUGIN: 'C7AB00000000000000000010',
  BF_PLUGIN: 'C7AB00000000000000000011',
  BF_ATTR_A: 'C7AB00000000000000000012',
  PH_SOURCES: 'C7AB00000000000000000020',
  PH_FRAMEWORKS: 'C7AB00000000000000000021',
  PH_RESOURCES: 'C7AB00000000000000000022',
  PH_EMBED: 'C7AB00000000000000000023',
  BF_EMBED: 'C7AB00000000000000000024',
  TARGET: 'C7AB00000000000000000030',
  CFG_DEBUG: 'C7AB00000000000000000031',
  CFG_RELEASE: 'C7AB00000000000000000032',
  CFG_LIST: 'C7AB00000000000000000033',
  DEP: 'C7AB00000000000000000040',
  PROXY: 'C7AB00000000000000000041',
};

if (s.includes(ID.TARGET)) { console.log('already patched'); process.exit(0); }

function rep(oldStr, newStr) {
  if (!s.includes(oldStr)) throw new Error('anchor not found: ' + oldStr.slice(0, 80));
  s = s.replace(oldStr, newStr);
}

// ---------- PBXBuildFile ----------
rep(`/* End PBXBuildFile section */`,
  `\t${ID.BF_BUNDLE} /* IslandWidgetBundle.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_BUNDLE} /* IslandWidgetBundle.swift */; };\n` +
  `\t${ID.BF_WIDGET} /* CrabIslandWidget.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_WIDGET} /* CrabIslandWidget.swift */; };\n` +
  `\t${ID.BF_ATTR_W} /* CrabAttributes.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_ATTR} /* CrabAttributes.swift */; };\n` +
  `\t${ID.BF_STATES} /* CrabStates2.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_STATES} /* CrabStates2.swift */; };\n` +
  `\t${ID.BF_FRAMES} /* CrabFramesView.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_FRAMES} /* CrabFramesView.swift */; };\n` +
  `\t${ID.BF_FONTS} /* fonts in Resources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_FONTS} /* fonts */; };\n` +
  `\t${ID.BF_PLUGIN} /* CrabIslandPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_PLUGIN} /* CrabIslandPlugin.swift */; };\n` +
  `\t${ID.BF_ATTR_A} /* CrabAttributes.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.FR_ATTR} /* CrabAttributes.swift */; };\n` +
  `\t${ID.BF_EMBED} /* IslandWidget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = ${ID.PRODUCT} /* IslandWidget.appex */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };\n` +
  `/* End PBXBuildFile section */`);

// ---------- PBXFileReference ----------
rep(`/* End PBXFileReference section */`,
  `\t${ID.PRODUCT} /* IslandWidget.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = IslandWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n` +
  `\t${ID.FR_BUNDLE} /* IslandWidgetBundle.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = IslandWidgetBundle.swift; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_WIDGET} /* CrabIslandWidget.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CrabIslandWidget.swift; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_ATTR} /* CrabAttributes.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CrabAttributes.swift; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_STATES} /* CrabStates2.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CrabStates2.swift; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_FRAMES} /* CrabFramesView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CrabFramesView.swift; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_FONTS} /* fonts */ = {isa = PBXFileReference; lastKnownFileType = folder; path = fonts; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_INFO} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };\n` +
  `\t${ID.FR_PLUGIN} /* CrabIslandPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = CrabIslandPlugin.swift; sourceTree = "<group>"; };\n` +
  `/* End PBXFileReference section */`);

// ---------- PBXGroup ----------
// App group 里加插件源文件
rep(`\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n\t\t\t\t50379B222058CBB4000EE86E /* capacitor.config.json */,`,
  `\t\t\t\t9582B6822FE993A50072D4E8 /* SceneDelegate.swift */,\n\t\t\t\t${ID.FR_PLUGIN} /* CrabIslandPlugin.swift */,\n\t\t\t\t50379B222058CBB4000EE86E /* capacitor.config.json */,`);
// main group 加 IslandWidget 组
rep(`\t\t\t\t958DCC722DB07C7200EA8C5F /* debug.xcconfig */,\n\t\t\t\t504EC3061FED79650016851F /* App */,\n\t\t\t\t504EC3051FED79650016851F /* Products */,`,
  `\t\t\t\t958DCC722DB07C7200EA8C5F /* debug.xcconfig */,\n\t\t\t\t504EC3061FED79650016851F /* App */,\n\t\t\t\t${ID.GROUP} /* IslandWidget */,\n\t\t\t\t504EC3051FED79650016851F /* Products */,`);
// Products 里加 appex
rep(`\t\t\t\t504EC3041FED79650016851F /* App.app */,\n\t\t\t);\n\t\t\tname = Products;`,
  `\t\t\t\t504EC3041FED79650016851F /* App.app */,\n\t\t\t\t${ID.PRODUCT} /* IslandWidget.appex */,\n\t\t\t);\n\t\t\tname = Products;`);
// 新组本体
rep(`/* End PBXGroup section */`,
  `\t\t${ID.GROUP} /* IslandWidget */ = {\n` +
  `\t\t\tisa = PBXGroup;\n` +
  `\t\t\tchildren = (\n` +
  `\t\t\t\t${ID.FR_BUNDLE} /* IslandWidgetBundle.swift */,\n` +
  `\t\t\t\t${ID.FR_WIDGET} /* CrabIslandWidget.swift */,\n` +
  `\t\t\t\t${ID.FR_ATTR} /* CrabAttributes.swift */,\n` +
  `\t\t\t\t${ID.FR_STATES} /* CrabStates2.swift */,\n` +
  `\t\t\t\t${ID.FR_FRAMES} /* CrabFramesView.swift */,\n` +
  `\t\t\t\t${ID.FR_FONTS} /* fonts */,\n` +
  `\t\t\t\t${ID.FR_INFO} /* Info.plist */,\n` +
  `\t\t\t);\n` +
  `\t\t\tpath = IslandWidget;\n` +
  `\t\t\tsourceTree = "<group>";\n` +
  `\t\t};\n` +
  `/* End PBXGroup section */`);

// ---------- PBXNativeTarget ----------
// App target 的 buildPhases 加 Embed、dependencies 加 DEP
rep(`\t\t\tbuildPhases = (\n\t\t\t\t504EC3001FED79650016851F /* Sources */,\n\t\t\t\t504EC3011FED79650016851F /* Frameworks */,\n\t\t\t\t504EC3021FED79650016851F /* Resources */,\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t);`,
  `\t\t\tbuildPhases = (\n\t\t\t\t504EC3001FED79650016851F /* Sources */,\n\t\t\t\t504EC3011FED79650016851F /* Frameworks */,\n\t\t\t\t504EC3021FED79650016851F /* Resources */,\n\t\t\t\t${ID.PH_EMBED} /* Embed Foundation Extensions */,\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t\t${ID.DEP} /* PBXTargetDependency */,\n\t\t\t);`);
// 新 target + 两个新 section
rep(`/* End PBXNativeTarget section */`,
  `\t\t${ID.TARGET} /* IslandWidget */ = {\n` +
  `\t\t\tisa = PBXNativeTarget;\n` +
  `\t\t\tbuildConfigurationList = ${ID.CFG_LIST} /* Build configuration list for PBXNativeTarget "IslandWidget" */;\n` +
  `\t\t\tbuildPhases = (\n` +
  `\t\t\t\t${ID.PH_SOURCES} /* Sources */,\n` +
  `\t\t\t\t${ID.PH_FRAMEWORKS} /* Frameworks */,\n` +
  `\t\t\t\t${ID.PH_RESOURCES} /* Resources */,\n` +
  `\t\t\t);\n` +
  `\t\t\tbuildRules = (\n` +
  `\t\t\t);\n` +
  `\t\t\tdependencies = (\n` +
  `\t\t\t);\n` +
  `\t\t\tname = IslandWidget;\n` +
  `\t\t\tproductName = IslandWidget;\n` +
  `\t\t\tproductReference = ${ID.PRODUCT} /* IslandWidget.appex */;\n` +
  `\t\t\tproductType = "com.apple.product-type.app-extension";\n` +
  `\t\t};\n` +
  `/* End PBXNativeTarget section */\n\n` +
  `/* Begin PBXContainerItemProxy section */\n` +
  `\t\t${ID.PROXY} /* PBXContainerItemProxy */ = {\n` +
  `\t\t\tisa = PBXContainerItemProxy;\n` +
  `\t\t\tcontainerPortal = 504EC2FC1FED79650016851F /* Project object */;\n` +
  `\t\t\tproxyType = 1;\n` +
  `\t\t\tremoteGlobalIDString = ${ID.TARGET};\n` +
  `\t\t\tremoteInfo = IslandWidget;\n` +
  `\t\t};\n` +
  `/* End PBXContainerItemProxy section */\n\n` +
  `/* Begin PBXCopyFilesBuildPhase section */\n` +
  `\t\t${ID.PH_EMBED} /* Embed Foundation Extensions */ = {\n` +
  `\t\t\tisa = PBXCopyFilesBuildPhase;\n` +
  `\t\t\tbuildActionMask = 2147483647;\n` +
  `\t\t\tdstPath = "";\n` +
  `\t\t\tdstSubfolderSpec = 13;\n` +
  `\t\t\tfiles = (\n` +
  `\t\t\t\t${ID.BF_EMBED} /* IslandWidget.appex in Embed Foundation Extensions */,\n` +
  `\t\t\t);\n` +
  `\t\t\tname = "Embed Foundation Extensions";\n` +
  `\t\t\trunOnlyForDeploymentPostprocessing = 0;\n` +
  `\t\t};\n` +
  `/* End PBXCopyFilesBuildPhase section */\n\n` +
  `/* Begin PBXTargetDependency section */\n` +
  `\t\t${ID.DEP} /* PBXTargetDependency */ = {\n` +
  `\t\t\tisa = PBXTargetDependency;\n` +
  `\t\t\ttarget = ${ID.TARGET} /* IslandWidget */;\n` +
  `\t\t\ttargetProxy = ${ID.PROXY} /* PBXContainerItemProxy */;\n` +
  `\t\t};\n` +
  `/* End PBXTargetDependency section */`);

// ---------- PBXProject ----------
rep(`\t\t\t\t\t504EC3031FED79650016851F = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;\n\t\t\t\t\t\tLastSwiftMigration = 1100;\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t};\n\t\t\t\t};`,
  `\t\t\t\t\t504EC3031FED79650016851F = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;\n\t\t\t\t\t\tLastSwiftMigration = 1100;\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t};\n\t\t\t\t\t${ID.TARGET} = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 15.2;\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t};\n\t\t\t\t};`);
rep(`\t\t\ttargets = (\n\t\t\t\t504EC3031FED79650016851F /* App */,\n\t\t\t);`,
  `\t\t\ttargets = (\n\t\t\t\t504EC3031FED79650016851F /* App */,\n\t\t\t\t${ID.TARGET} /* IslandWidget */,\n\t\t\t);`);

// ---------- Sources / Resources / Frameworks ----------
rep(`/* End PBXResourcesBuildPhase section */`,
  `\t\t${ID.PH_RESOURCES} /* Resources */ = {\n` +
  `\t\t\tisa = PBXResourcesBuildPhase;\n` +
  `\t\t\tbuildActionMask = 2147483647;\n` +
  `\t\t\tfiles = (\n` +
  `\t\t\t\t${ID.BF_FONTS} /* fonts in Resources */,\n` +
  `\t\t\t);\n` +
  `\t\t\trunOnlyForDeploymentPostprocessing = 0;\n` +
  `\t\t};\n` +
  `/* End PBXResourcesBuildPhase section */\n\n` +
  `/* Begin PBXFrameworksBuildPhase section helper for IslandWidget */`);

rep(`/* End PBXSourcesBuildPhase section */`,
  `\t\t${ID.PH_SOURCES} /* Sources */ = {\n` +
  `\t\t\tisa = PBXSourcesBuildPhase;\n` +
  `\t\t\tbuildActionMask = 2147483647;\n` +
  `\t\t\tfiles = (\n` +
  `\t\t\t\t${ID.BF_BUNDLE} /* IslandWidgetBundle.swift in Sources */,\n` +
  `\t\t\t\t${ID.BF_WIDGET} /* CrabIslandWidget.swift in Sources */,\n` +
  `\t\t\t\t${ID.BF_ATTR_W} /* CrabAttributes.swift in Sources */,\n` +
  `\t\t\t\t${ID.BF_STATES} /* CrabStates2.swift in Sources */,\n` +
  `\t\t\t\t${ID.BF_FRAMES} /* CrabFramesView.swift in Sources */,\n` +
  `\t\t\t);\n` +
  `\t\t\trunOnlyForDeploymentPostprocessing = 0;\n` +
  `\t\t};\n` +
  `/* End PBXSourcesBuildPhase section */`);

// App Sources 加插件 + CrabAttributes
rep(`\t\t\t\t504EC3081FED79650016851F /* AppDelegate.swift in Sources */,\n\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,`,
  `\t\t\t\t504EC3081FED79650016851F /* AppDelegate.swift in Sources */,\n\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,\n\t\t\t\t${ID.BF_PLUGIN} /* CrabIslandPlugin.swift in Sources */,\n\t\t\t\t${ID.BF_ATTR_A} /* CrabAttributes.swift in Sources */,`);

// Widget Frameworks（空）插在 PBXFrameworksBuildPhase 区
rep(`/* End PBXFrameworksBuildPhase section */`,
  `\t\t${ID.PH_FRAMEWORKS} /* Frameworks */ = {\n` +
  `\t\t\tisa = PBXFrameworksBuildPhase;\n` +
  `\t\t\tbuildActionMask = 2147483647;\n` +
  `\t\t\tfiles = (\n` +
  `\t\t\t);\n` +
  `\t\t\trunOnlyForDeploymentPostprocessing = 0;\n` +
  `\t\t};\n` +
  `/* End PBXFrameworksBuildPhase section */`);

// ---------- XCBuildConfiguration ----------
const WIDGET_SETTINGS = (name) =>
  `\t\t${name === 'Debug' ? ID.CFG_DEBUG : ID.CFG_RELEASE} /* ${name} */ = {\n` +
  `\t\t\tisa = XCBuildConfiguration;\n` +
  `\t\t\tbuildSettings = {\n` +
  `\t\t\t\tCODE_SIGN_STYLE = Automatic;\n` +
  `\t\t\t\tCURRENT_PROJECT_VERSION = 2;\n` +
  `\t\t\t\tGENERATE_INFOPLIST_FILE = NO;\n` +
  `\t\t\t\tINFOPLIST_FILE = IslandWidget/Info.plist;\n` +
  `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.1;\n` +
  `\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (\n` +
  `\t\t\t\t\t"$(inherited)",\n` +
  `\t\t\t\t\t"@executable_path/Frameworks",\n` +
  `\t\t\t\t\t"@executable_path/../../Frameworks",\n` +
  `\t\t\t\t);\n` +
  `\t\t\t\tMARKETING_VERSION = 1.0;\n` +
  `\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.uwu.octopusink.IslandWidget;\n` +
  `\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";\n` +
  `\t\t\t\tSDKROOT = iphoneos;\n` +
  `\t\t\t\tSKIP_INSTALL = YES;\n` +
  `\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;\n` +
  `\t\t\t\tSWIFT_VERSION = 5.0;\n` +
  `\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";\n` +
  `\t\t\t};\n` +
  `\t\t\tname = ${name};\n` +
  `\t\t};\n`;

rep(`/* End XCBuildConfiguration section */`,
  WIDGET_SETTINGS('Debug') + WIDGET_SETTINGS('Release') + `/* End XCBuildConfiguration section */`);

// ---------- XCConfigurationList ----------
rep(`/* End XCConfigurationList section */`,
  `\t\t${ID.CFG_LIST} /* Build configuration list for PBXNativeTarget "IslandWidget" */ = {\n` +
  `\t\t\tisa = XCConfigurationList;\n` +
  `\t\t\tbuildConfigurations = (\n` +
  `\t\t\t\t${ID.CFG_DEBUG} /* Debug */,\n` +
  `\t\t\t\t${ID.CFG_RELEASE} /* Release */,\n` +
  `\t\t\t);\n` +
  `\t\t\tdefaultConfigurationIsVisible = 0;\n` +
  `\t\t\tdefaultConfigurationName = Release;\n` +
  `\t\t};\n` +
  `/* End XCConfigurationList section */`);

fs.writeFileSync(P, s, 'utf8');
console.log('pbxproj patched OK,', s.length, 'bytes');
