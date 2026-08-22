# RPM spec for linux-doctor (Fedora / RHEL / COPR).
# Build from the npm tarball produced by `npm pack` at a release tag:
#   VERSION=0.2.0; npm pack && mv linux-doctor-*.tgz ~/rpmbuild/SOURCES/linux-doctor-$VERSION.tar.gz
# npm pack tarballs extract to a `package/` directory, hence -n package.
Name:           linux-doctor
Version:        0.2.0
Release:        1%{?dist}
Summary:        Plain-English health checks for your Linux system
License:        GPL-3.0-or-later
URL:            https://github.com/zShaD0w7x/linux-doctor
Source0:        %{name}-%{version}.tar.gz
BuildArch:      noarch
Requires:       nodejs >= 20

%description
Linux Doctor runs read-only health checks on your system, explains problems
in plain English, and tells you exactly how to fix them. Checks cover memory,
disk, services, security, updates, GPU, network, backups and more — with a
health score, history, and a web dashboard.

%prep
%setup -q -n package

%install
mkdir -p %{buildroot}%{_libdir}/linux-doctor %{buildroot}%{_bindir}
cp -r bin src src-gui/index.html package.json README.md LICENSE %{buildroot}%{_libdir}/linux-doctor/
ln -s %{_libdir}/linux-doctor/bin/doctor.js %{buildroot}%{_bindir}/linux-doctor
chmod 0755 %{buildroot}%{_libdir}/linux-doctor/bin/doctor.js

%files
%{_libdir}/linux-doctor
%{_bindir}/linux-doctor

%changelog
* Tue Aug 18 2026 Linux Doctor <maintainer@example.com> - 0.2.0-1
- Sync to 0.2.0; add audio and containers checks
* Tue Aug 18 2026 Linux Doctor <maintainer@example.com> - 0.1.0-1
- Initial packaging
