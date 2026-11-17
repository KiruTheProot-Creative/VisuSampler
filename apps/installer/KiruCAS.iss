; Kiru Creative Audio Suite (Kiru CAS) installer (Inno Setup 6): KCS's audio tools and plugins in one setup.
; Today: VisuMaker, VisuPlayer, NodeFX and HyperSynth (the plugins as VST3 + standalone).
; The AppId is the one the earlier "VisuSampler" setup used, so this setup upgrades that install in place.
; Every part is optional: a part whose /D folder is not given is left out (for now the release ships HyperSynth only).
; Built by .github/workflows/release.yml:
;   iscc /DVersion=0.0.1 /DBuild=abc1234 /DRoot=<repo> /DMakerDir=<win-unpacked> /DVst3Dir=<VisuPlayer.vst3> /DStandaloneExe=<VisuPlayer.exe> /DNodeFXVst3Dir=<NodeFX.vst3> /DNodeFXExe=<NodeFX.exe> /DHyperSynthVst3Dir=<HyperSynth.vst3> /DHyperSynthExe=<HyperSynth.exe> /DOutDir=<out> KiruCAS.iss

#ifndef Version
  #define Version "0.0.1"
#endif
#ifndef Build
  #define Build "dev"
#endif

[Setup]
AppId={{8F6A3C2E-5B1D-4E7A-9C3F-2D8E1A6B4C70}
AppName=Kiru Creative Audio Suite
AppVersion={#Version}
AppVerName=Kiru Creative Audio Suite {#Version} (build {#Build})
AppPublisher=KiruTheProot-Creative
AppPublisherURL=https://github.com/KiruTheProot-Creative/VisuSampler
AppSupportURL=https://github.com/KiruTheProot-Creative/VisuSampler/issues
VersionInfoVersion={#Version}
DefaultDirName={autopf}\Kiru CAS
DefaultGroupName=Kiru CAS
DisableProgramGroupPage=yes
; two folders to choose: the standalone apps ({app}, the next page) and the VST3 plugins (a page of its own, after
; the parts). Both are shown on every run, filled in with the last choice; a silent setup takes /DIR= and /VST3DIR=.
DisableDirPage=no
UsePreviousAppDir=yes
LicenseFile={#Root}\LICENSE
InfoBeforeFile={#Root}\apps\installer\before-install.txt
OutputDir={#OutDir}
OutputBaseFilename=KiruCAS-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
; the look: dark, with the suite's own artwork (Inno Setup 6.7 or later): a panel with a wooden side and a keyboard on the
; welcome and finish pages, a brushed-metal background, the K keyboard tile. Made by apps/installer/art/make-art.py.
WizardStyle=modern dark
WizardImageFile=art\wizard-164.png,art\wizard-202.png,art\wizard-246.png,art\wizard-328.png,art\wizard-410.png
WizardSmallImageFile=art\small-55.png,art\small-69.png,art\small-83.png,art\small-110.png,art\small-138.png
WizardBackImageFile=art\back-600.png,art\back-900.png,art\back-1200.png
WizardImageBackColor=#1d1e21
DisableWelcomePage=no
SetupIconFile=art\setup.ico
ChangesAssociations=yes
CloseApplications=yes
UninstallDisplayName=Kiru Creative Audio Suite (Kiru CAS) {#Version}
#ifdef MakerDir
UninstallDisplayIcon={app}\VisuMaker\VisuMaker.exe
#else
UninstallDisplayIcon={app}\HyperSynth\HyperSynth.exe
#endif
VersionInfoDescription=Kiru Creative Audio Suite setup
VersionInfoProductName=Kiru Creative Audio Suite
SetupLogging=yes

[Messages]
SelectDirDesc=Where should the standalone apps go?
SelectDirLabel3=The standalone apps (HyperSynth and the others you pick next) go into this folder, each in its own subfolder. The VST3 plugins get a folder of their own on a later page.
SelectDirBrowseLabel=To continue, click Next. To pick another folder, click Browse.
ReadyMemoDir=Standalone apps folder:

[Types]
Name: "full"; Description: "Everything in this setup"
#ifdef Vst3Dir
Name: "player"; Description: "Only VisuPlayer (to play libraries)"
#endif
Name: "custom"; Description: "Let me choose"; Flags: iscustom

[Components]
#ifdef MakerDir
Name: "maker"; Description: "VisuMaker: build your own libraries"; Types: full custom
#endif
#ifdef Vst3Dir
Name: "vst3"; Description: "VisuPlayer VST3 plugin (for your DAW)"; Types: full player custom
Name: "standalone"; Description: "VisuPlayer standalone app (play without a DAW)"; Types: full player custom
#endif
#ifdef NodeFXVst3Dir
Name: "nodefx"; Description: "NodeFX: node-based effects plugin (VST3 and standalone)"; Types: full custom
#endif
#ifdef HyperSynthVst3Dir
Name: "hypersynth"; Description: "HyperSynth: two-layer synthesizer (VST3 and standalone)"; Types: full custom
#endif

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcuts"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Dirs]
#ifdef Vst3Dir
Name: "{code:Vst3Root}\VisuPlayer.vst3"; Components: vst3; Attribs: system
#endif
#ifdef NodeFXVst3Dir
Name: "{code:Vst3Root}\NodeFX.vst3"; Components: nodefx; Attribs: system
#endif
#ifdef HyperSynthVst3Dir
Name: "{code:Vst3Root}\HyperSynth.vst3"; Components: hypersynth; Attribs: system
#endif

[Files]
#ifdef MakerDir
Source: "{#MakerDir}\*"; DestDir: "{app}\VisuMaker"; Components: maker; Flags: ignoreversion recursesubdirs createallsubdirs
#endif
#ifdef Vst3Dir
Source: "{#Vst3Dir}\*"; Excludes: "desktop.ini,PlugIn.ico"; DestDir: "{code:Vst3Root}\VisuPlayer.vst3"; Components: vst3; Flags: ignoreversion recursesubdirs createallsubdirs
; the bundle's folder icon in Explorer (Steinberg's VST3 layout: PlugIn.ico + desktop.ini, the folder marked system)
Source: "{#Root}\assets\logos\visusampler.ico"; DestDir: "{code:Vst3Root}\VisuPlayer.vst3"; DestName: "PlugIn.ico"; Components: vst3; Attribs: hidden system; Flags: ignoreversion
Source: "{#Root}\apps\installer\vst3-desktop.ini"; DestDir: "{code:Vst3Root}\VisuPlayer.vst3"; DestName: "desktop.ini"; Components: vst3; Attribs: hidden system; Flags: ignoreversion
Source: "{#StandaloneExe}"; DestDir: "{app}\VisuPlayer"; DestName: "VisuPlayer.exe"; Components: standalone; Flags: ignoreversion
#endif
#ifdef NodeFXVst3Dir
Source: "{#NodeFXVst3Dir}\*"; Excludes: "desktop.ini,PlugIn.ico"; DestDir: "{code:Vst3Root}\NodeFX.vst3"; Components: nodefx; Flags: ignoreversion recursesubdirs createallsubdirs
; the bundle's folder icon in Explorer (Steinberg's VST3 layout: PlugIn.ico + desktop.ini, the folder marked system)
Source: "{#Root}\assets\logos\nodefx.ico"; DestDir: "{code:Vst3Root}\NodeFX.vst3"; DestName: "PlugIn.ico"; Components: nodefx; Attribs: hidden system; Flags: ignoreversion
Source: "{#Root}\apps\installer\vst3-desktop.ini"; DestDir: "{code:Vst3Root}\NodeFX.vst3"; DestName: "desktop.ini"; Components: nodefx; Attribs: hidden system; Flags: ignoreversion
Source: "{#NodeFXExe}"; DestDir: "{app}\NodeFX"; DestName: "NodeFX.exe"; Components: nodefx; Flags: ignoreversion
#endif
#ifdef HyperSynthVst3Dir
Source: "{#HyperSynthVst3Dir}\*"; Excludes: "desktop.ini,PlugIn.ico"; DestDir: "{code:Vst3Root}\HyperSynth.vst3"; Components: hypersynth; Flags: ignoreversion recursesubdirs createallsubdirs
; the bundle's folder icon in Explorer (Steinberg's VST3 layout: PlugIn.ico + desktop.ini, the folder marked system)
Source: "{#Root}\assets\logos\hypersynth.ico"; DestDir: "{code:Vst3Root}\HyperSynth.vst3"; DestName: "PlugIn.ico"; Components: hypersynth; Attribs: hidden system; Flags: ignoreversion
Source: "{#Root}\apps\installer\vst3-desktop.ini"; DestDir: "{code:Vst3Root}\HyperSynth.vst3"; DestName: "desktop.ini"; Components: hypersynth; Attribs: hidden system; Flags: ignoreversion
Source: "{#HyperSynthExe}"; DestDir: "{app}\HyperSynth"; DestName: "HyperSynth.exe"; Components: hypersynth; Flags: ignoreversion
; the factory presets as .hsyn files, to look at, copy and share (the plugin has them built in as well)
Source: "{#Root}\apps\plugin\hypersynth\presets\hsyn\*"; DestDir: "{app}\HyperSynth\Factory Presets"; Components: hypersynth; Flags: ignoreversion recursesubdirs createallsubdirs
#endif
Source: "{#Root}\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "{#Root}\NOTICE.md"; DestDir: "{app}"; DestName: "NOTICE.txt"; Flags: ignoreversion
Source: "{#Root}\TERMS.md"; DestDir: "{app}"; DestName: "TERMS.txt"; Flags: ignoreversion

[Icons]
#ifdef MakerDir
Name: "{group}\VisuMaker"; Filename: "{app}\VisuMaker\VisuMaker.exe"; Components: maker
#endif
#ifdef Vst3Dir
Name: "{group}\VisuPlayer"; Filename: "{app}\VisuPlayer\VisuPlayer.exe"; Components: standalone
#endif
#ifdef NodeFXVst3Dir
Name: "{group}\NodeFX"; Filename: "{app}\NodeFX\NodeFX.exe"; Components: nodefx
#endif
#ifdef HyperSynthVst3Dir
Name: "{group}\HyperSynth"; Filename: "{app}\HyperSynth\HyperSynth.exe"; Components: hypersynth
Name: "{group}\HyperSynth factory presets"; Filename: "{app}\HyperSynth\Factory Presets"; Components: hypersynth
#endif
Name: "{group}\License"; Filename: "{app}\LICENSE.txt"
Name: "{group}\Terms of use"; Filename: "{app}\TERMS.txt"
Name: "{group}\Uninstall Kiru CAS"; Filename: "{uninstallexe}"
#ifdef MakerDir
Name: "{autodesktop}\VisuMaker"; Filename: "{app}\VisuMaker\VisuMaker.exe"; Components: maker; Tasks: desktopicon
#endif
#ifdef Vst3Dir
Name: "{autodesktop}\VisuPlayer"; Filename: "{app}\VisuPlayer\VisuPlayer.exe"; Components: standalone; Tasks: desktopicon
#endif
#ifdef NodeFXVst3Dir
Name: "{autodesktop}\NodeFX"; Filename: "{app}\NodeFX\NodeFX.exe"; Components: nodefx; Tasks: desktopicon
#endif
#ifdef HyperSynthVst3Dir
Name: "{autodesktop}\HyperSynth"; Filename: "{app}\HyperSynth\HyperSynth.exe"; Components: hypersynth; Tasks: desktopicon
#endif

#ifdef MakerDir
[Registry]
; double-clicking a .vmproj opens it in VisuMaker
Root: HKA; Subkey: "Software\Classes\.vmproj"; ValueType: string; ValueName: ""; ValueData: "VisuMaker.Project"; Flags: uninsdeletevalue; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project"; ValueType: string; ValueName: ""; ValueData: "VisuMaker project"; Flags: uninsdeletekey; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\VisuMaker\VisuMaker.exe,0"; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\VisuMaker\VisuMaker.exe"" ""%1"""; Components: maker

[Run]
Filename: "{app}\VisuMaker\VisuMaker.exe"; Description: "Start VisuMaker"; Flags: nowait postinstall skipifsilent unchecked; Components: maker
#endif

[UninstallDelete]
; only what the installer put there; libraries, projects, presets and logs in Documents stay
; (the .vst3 folders go with their [Dirs] entries, wherever they were put)
Type: dirifempty; Name: "{app}"

[Code]
{ Earlier builds came as a separate VisuMaker setup, installed for the current user only. If it is there,
  remove it quietly first, so there are not two VisuMakers (its user data and libraries are kept). }
procedure RemoveOldVisuMaker();
var
  Keys: TArrayOfString;
  I, Code: Integer;
  Base, Name, Cmd: String;
begin
  Base := 'Software\Microsoft\Windows\CurrentVersion\Uninstall';
  if not RegGetSubkeyNames(HKCU, Base, Keys) then Exit;
  for I := 0 to GetArrayLength(Keys) - 1 do
  begin
    if RegQueryStringValue(HKCU, Base + '\' + Keys[I], 'DisplayName', Name) and (Pos('VisuMaker', Name) = 1) then
      if RegQueryStringValue(HKCU, Base + '\' + Keys[I], 'QuietUninstallString', Cmd) and (Cmd <> '') then
      begin
        Log('Removing the earlier VisuMaker setup: ' + Cmd);
        Exec(ExpandConstant('{cmd}'), '/C "' + Cmd + '"', '', SW_HIDE, ewWaitUntilTerminated, Code);
        Log('...done, exit code ' + IntToStr(Code));
      end;
  end;
end;


{ ---- the VST3 folder: its own page, after the parts are picked; remembered for the next update ---- }
var
  Vst3Page: TInputDirWizardPage;

function StandardVst3(): String;
begin
  Result := ExpandConstant('{commoncf64}\VST3');
end;

{ whether any part with a VST3 plugin is picked }
function AnyVst3(): Boolean;
begin
  Result := False;
#ifdef Vst3Dir
  if WizardIsComponentSelected('vst3') then Result := True;
#endif
#ifdef NodeFXVst3Dir
  if WizardIsComponentSelected('nodefx') then Result := True;
#endif
#ifdef HyperSynthVst3Dir
  if WizardIsComponentSelected('hypersynth') then Result := True;
#endif
end;

function Vst3Root(Param: String): String;
begin
  Result := RemoveBackslashUnlessRoot(Trim(Vst3Page.Values[0]));
  if Result = '' then Result := StandardVst3();
end;

procedure InitializeWizard();
var
  S: String;
begin
  Vst3Page := CreateInputDirPage(wpSelectComponents,
    'Where should the VST3 plugins go?', 'Your DAW loads the plugins from this folder.',
    'Each plugin goes in here as a .vst3 folder.' + #13#10#13#10 +
    'The standard place is C:\Program Files\Common Files\VST3: every DAW looks there on its own. ' +
    'If you pick another folder, add it to the plugin folders in your DAW''s settings and rescan.' + #13#10#13#10 +
    'To continue, click Next. To pick another folder, click Browse.',
    False, 'VST3');
  Vst3Page.Add('');
  S := ExpandConstant('{param:VST3DIR}');
  if S = '' then S := GetPreviousData('Vst3Dir', StandardVst3());
  Vst3Page.Values[0] := S;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = Vst3Page.ID) and not AnyVst3();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = Vst3Page.ID then
  begin
    if Trim(Vst3Page.Values[0]) = '' then
    begin
      MsgBox('Please pick a folder for the VST3 plugins.', mbError, MB_OK);
      Result := False;
    end
    else if CompareText(Vst3Root(''), StandardVst3()) <> 0 then
      Result := SuppressibleMsgBox('Your DAW will not find the plugins in this folder until you add it to its plugin folders.' + #13#10#13#10 +
        'Use ' + Vst3Root('') + ' anyway?', mbConfirmation, MB_YESNO, IDYES) = IDYES;
  end;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'Vst3Dir', Vst3Root(''));
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo;
  if AnyVst3() then Result := Result + NewLine + NewLine + 'VST3 plugins folder:' + NewLine + Space + Vst3Root('');
  if MemoTypeInfo <> '' then Result := Result + NewLine + NewLine + MemoTypeInfo;
  if MemoComponentsInfo <> '' then Result := Result + NewLine + NewLine + MemoComponentsInfo;
  if MemoTasksInfo <> '' then Result := Result + NewLine + NewLine + MemoTasksInfo;
end;

{ An update to other folders moves the parts: what this setup put in the earlier folders goes, so a DAW does not
  find two HyperSynths. Only the setup's own folders and files there; anything else in those folders stays. }
procedure RemoveOldPlace(const Dir: String; const Names: array of String);
var
  I: Integer;
begin
  for I := 0 to GetArrayLength(Names) - 1 do
    if DirExists(Dir + '\' + Names[I]) then
    begin
      Log('Moved: removing the earlier ' + Dir + '\' + Names[I]);
      DelTree(Dir + '\' + Names[I], True, True, True);
    end
    else if FileExists(Dir + '\' + Names[I]) then
    begin
      Log('Moved: removing the earlier ' + Dir + '\' + Names[I]);
      DeleteFile(Dir + '\' + Names[I]);
    end;
end;

procedure MoveFromEarlierPlaces();
var
  OldApp, OldVst3: String;
begin
  OldVst3 := RemoveBackslashUnlessRoot(GetPreviousData('Vst3Dir', ''));
  { setups before this choice existed always used the standard folder }
  if (OldVst3 = '') and (WizardForm.PrevAppDir <> '') then OldVst3 := StandardVst3();
  if (OldVst3 <> '') and (CompareText(OldVst3, Vst3Root('')) <> 0) then
    RemoveOldPlace(OldVst3, ['VisuPlayer.vst3', 'NodeFX.vst3', 'HyperSynth.vst3']);
  OldApp := RemoveBackslashUnlessRoot(WizardForm.PrevAppDir);
  if (OldApp <> '') and (CompareText(OldApp, RemoveBackslashUnlessRoot(ExpandConstant('{app}'))) <> 0) then
  begin
    RemoveOldPlace(OldApp, ['VisuMaker', 'VisuPlayer', 'NodeFX', 'HyperSynth', 'LICENSE.txt', 'NOTICE.txt', 'TERMS.txt', 'unins000.exe', 'unins000.dat', 'unins000.msg']);
    RemoveDir(OldApp);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then MoveFromEarlierPlaces();
#ifdef MakerDir
  if (CurStep = ssInstall) and WizardIsComponentSelected('maker') then RemoveOldVisuMaker();
#endif
end;
