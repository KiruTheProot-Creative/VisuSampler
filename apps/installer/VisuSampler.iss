; VisuSampler installer (Inno Setup 6): VisuMaker, the VisuPlayer VST3 and the standalone VisuPlayer in one setup.
; Built by .github/workflows/release.yml:
;   iscc /DVersion=0.0.1 /DBuild=abc1234 /DRoot=<repo> /DMakerDir=<win-unpacked> /DVst3Dir=<VisuPlayer.vst3> /DStandaloneExe=<VisuPlayer.exe> /DOutDir=<out> VisuSampler.iss

#ifndef Version
  #define Version "0.0.1"
#endif
#ifndef Build
  #define Build "dev"
#endif

[Setup]
AppId={{8F6A3C2E-5B1D-4E7A-9C3F-2D8E1A6B4C70}
AppName=VisuSampler
AppVersion={#Version}
AppVerName=VisuSampler {#Version} (build {#Build})
AppPublisher=KiruTheProot-Creative
AppPublisherURL=https://github.com/KiruTheProot-Creative/VisuSampler
AppSupportURL=https://github.com/KiruTheProot-Creative/VisuSampler/issues
VersionInfoVersion={#Version}
DefaultDirName={autopf}\VisuSampler
DefaultGroupName=VisuSampler
DisableProgramGroupPage=yes
LicenseFile={#Root}\LICENSE
InfoBeforeFile={#Root}\apps\installer\before-install.txt
OutputDir={#OutDir}
OutputBaseFilename=VisuSampler-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
ChangesAssociations=yes
CloseApplications=yes
UninstallDisplayName=VisuSampler {#Version}
UninstallDisplayIcon={app}\VisuMaker\VisuMaker.exe
SetupLogging=yes

[Types]
Name: "full"; Description: "Everything (VisuMaker and VisuPlayer)"
Name: "player"; Description: "Only VisuPlayer (to play libraries)"
Name: "custom"; Description: "Let me choose"; Flags: iscustom

[Components]
Name: "maker"; Description: "VisuMaker: build your own libraries"; Types: full custom
Name: "vst3"; Description: "VisuPlayer VST3 plugin (for your DAW)"; Types: full player custom
Name: "standalone"; Description: "VisuPlayer standalone app (play without a DAW)"; Types: full player custom

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcuts"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#MakerDir}\*"; DestDir: "{app}\VisuMaker"; Components: maker; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Vst3Dir}\*"; DestDir: "{commoncf64}\VST3\VisuPlayer.vst3"; Components: vst3; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StandaloneExe}"; DestDir: "{app}\VisuPlayer"; DestName: "VisuPlayer.exe"; Components: standalone; Flags: ignoreversion
Source: "{#Root}\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "{#Root}\NOTICE.md"; DestDir: "{app}"; DestName: "NOTICE.txt"; Flags: ignoreversion

[Icons]
Name: "{group}\VisuMaker"; Filename: "{app}\VisuMaker\VisuMaker.exe"; Components: maker
Name: "{group}\VisuPlayer"; Filename: "{app}\VisuPlayer\VisuPlayer.exe"; Components: standalone
Name: "{group}\License"; Filename: "{app}\LICENSE.txt"
Name: "{group}\Uninstall VisuSampler"; Filename: "{uninstallexe}"
Name: "{autodesktop}\VisuMaker"; Filename: "{app}\VisuMaker\VisuMaker.exe"; Components: maker; Tasks: desktopicon
Name: "{autodesktop}\VisuPlayer"; Filename: "{app}\VisuPlayer\VisuPlayer.exe"; Components: standalone; Tasks: desktopicon

[Registry]
; double-clicking a .vmproj opens it in VisuMaker
Root: HKA; Subkey: "Software\Classes\.vmproj"; ValueType: string; ValueName: ""; ValueData: "VisuMaker.Project"; Flags: uninsdeletevalue; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project"; ValueType: string; ValueName: ""; ValueData: "VisuMaker project"; Flags: uninsdeletekey; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\VisuMaker\VisuMaker.exe,0"; Components: maker
Root: HKA; Subkey: "Software\Classes\VisuMaker.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\VisuMaker\VisuMaker.exe"" ""%1"""; Components: maker

[Run]
Filename: "{app}\VisuMaker\VisuMaker.exe"; Description: "Start VisuMaker"; Flags: nowait postinstall skipifsilent unchecked; Components: maker

[UninstallDelete]
; only what the installer put there; libraries, projects, presets and logs in Documents stay
Type: dirifempty; Name: "{commoncf64}\VST3\VisuPlayer.vst3"
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

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssInstall) and WizardIsComponentSelected('maker') then RemoveOldVisuMaker();
end;
