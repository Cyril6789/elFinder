"use strict";
/**
 * @class  elFinder command "paste"
 * Paste filesfrom clipboard into directory.
 * If files pasted in its parent directory - files duplicates will created
 *
 * @author Dmitry (dio) Levashov
 **/
elFinder.prototype.commands.paste = function() {
	
	this.disableOnSearch = true;
	this.updateOnSelect  = false;
	
	this.handlers = {
		changeclipboard : function() { this.update(); }
	}

	this.shortcuts = [{
		pattern     : 'ctrl+v shift+insert'
	}];
	
	this.getstate = function(dst) {
		if (dst) {
			if ($.isArray(dst)) {
				if (dst.length != 1) {
					return -1;
				}
				dst = this.fm.file(dst[0]);
			}
		} else {
			dst = this.fm.cwd();
		}

		return this.fm.clipboard().length && dst.mime == 'directory' && dst.write ? 0 : -1;
	}
	
	this.exec = function(dst) {
		var fm     = this.fm,
			errors = fm.errors(),
			dst    = dst ? this.files(dst)[0] : fm.cwd(),
			files  = fm.clipboard(),
			cnt    = files.length,
			cut    = cnt ? files[0].cut : false,
			error  = errors[cut ? 'move' : 'copy'],
			fpaste = [],
			fcopy  = [],
			dfrd   = $.Deferred()
				.fail(function(error) {
					error && fm.error(error);
				}),
			copy  = function(files) {
				return files.length && fm._commands.duplicate
					? fm.exec('duplicate', files)
					: $.Deferred().resolve();
			},
			paste = function(files) {
				var dfrd      = $.Deferred(),
					existed   = [],
					intersect = function(files, names) {
						var ret = [], 
							i   = files.length;

						while (i--) {
							$.inArray(files[i].name, names) !== -1 && ret.unshift(i);
						}
						return ret;
					},
					confirm   = function(ndx) {
						var i    = existed[ndx],
							file = files[i],
							last = ndx == existed.length-1;

						if (!file) {
							return;
						}

						fm.confirm({
							title  : fm.res('msg', 'move'),
							text   : fm.i18n([fm.res('error', 'exists'), file.name, fm.res('confirm', 'repl')]), 
							all    : !last,
							accept : {
								label    : 'yes',
								callback : function(all) {
									!last && !all
										? confirm(++ndx)
										: paste(files);
								}
							},
							reject : {
								label    : 'no',
								callback : function(all) {
									var i;

									if (all) {
										i = existed.length;
										while (ndx < i--) {
											files[existed[i]].remove = true
										}
									} else {
										files[existed[ndx]].remove = true;
									}

									!last && !all
										? confirm(++ndx)
										: paste(files);
								}
							},
							cancel : {
								label    : 'cancel',
								callback : function() {
									dfrd.resolve();
								}
							}
						})
					},
					valid     = function(names) {
						existed = intersect(files, names);
						existed.length ? confirm(0) : paste(files);
					},
					paste     = function(files) {
						var files  = $.map(files, function(file) { return !file.remove ? file : null } ),
							cnt    = files.length,
							groups = {},
							args   = [],
							src;

						if (!cnt) {
							return dfrd.resolve();
						}

						src = files[0].phash;
						files = $.map(files, function(f) { return f.hash});
						
						fm.request({
								data   : {cmd : 'paste', dst : dst.hash, targets : files, cut : cut ? 1 : 0, src : src},
								notify : {type : cut ? 'move' : 'copy', cnt : cnt}
							})
							.always(function() {
								fm.unlockfiles({files : files});
							});
					}
					;
				
				if (!files.length) {
					return dfrd.resolve();
				}
					
				if (fm.oldAPI) {
					paste(files);
				} else {
					
					if (!fm.option('copyOverwrite')) {
						paste(files);
					} else {
						dst.hash == fm.cwd().hash
							? valid($.map(fm.files(), function(file) { return file.phash == dst.hash ? file.name : null }))
							: fm.request({
								data : {cmd : 'ls', target : dst.hash},
								notify : {type : 'preparecopy', cnt : 1, hideCnt : true},
								preventFail : true
							})
							.always(function(data) {
								valid(data.list || [])
							});
					}
				}
				
				return dfrd;
			},
			parents;


		if (!cnt || !dst || dst.mime != 'directory') {
			return dfrd.reject();
		}
			
		if (!dst.write)	{
			return dfrd.reject([error, files[0].name, errors.perm]);
		}
		
		parents = fm.parents(dst.hash)
		
		$.each(files, function(i, file) {
			if (!file.read) {
				return !dfrd.reject([error, files[0].name, errors.perm]);
			}
			
			if (cut && file.locked) {
				return !dfrd.reject([errors.locked, file.name]);
			}
			
			if ($.inArray(file.hash, parents) !== -1) {
				return !dfrd.reject([errors.copyinself, file.name]);
			}
			
			if (file.phash == dst.hash) {
				fcopy.push(file.hash);
			} else {
				fpaste.push({
					hash  : file.hash,
					phash : file.phash,
					name  : file.name
				});
			}
		});

		return $.when(
			copy(fcopy),
			paste(fpaste)
		).always(function() {
			cut && fm.clipboard([]);
		});
	}

}