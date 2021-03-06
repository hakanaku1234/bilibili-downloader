const path = require("path");
const fs = require("fs");
const request = require("request");
const progress = require("progress-stream");
const async = require("async");
const mime = require("mime");
const electron = require("electron");
const { dialog, shell } = electron.remote;
const ipcRender = electron.ipcRenderer;

var videoUrl, playUrl, aid, p = 1, cid, count, links, downloadArray = [], downloadIndex = 0, manual = false;
var debug = !true;

function showError(text) {
	dialog.showMessageBox({type: "error", title: "[Error]", message: text});
}

function showWarning(text) {
	dialog.showMessageBox({type: "warning", title: "[Warning]", message: text});
}

function getVideoUrl() {
	var videoUrl = $("#videoUrl").val();
	//if (debug) videoUrl = "https://www.bilibili.com/bangumi/play/ep90832";
	if (debug) videoUrl = "https://www.bilibili.com/video/av23498892";
	if (videoUrl.indexOf("https://") != 0) {
		if (videoUrl.indexOf("av") != -1) videoUrl = "https://www.bilibili.com/video/av" + videoUrl.split("av")[1];
		else if (videoUrl.indexOf("ep") != -1) videoUrl = "https://www.bilibili.com/bangumi/play/ep" + videoUrl.split("ep")[1];
		else if (videoUrl.indexOf("ss") != -1) videoUrl = "https://www.bilibili.com/bangumi/play/ss" + videoUrl.split("ss")[1];
		else {
			showError("无效的视频链接！");
			$("#videoUrl").parent().addClass("has-error has-feedback");
			return null;
		}
	}
	$("#videoUrl").parent().removeClass("has-error has-feedback");
	return videoUrl;
}

function getPlayUrl() {
	var playUrl = $("#playUrl").val();
	if (debug) playUrl = "https://bangumi.bilibili.com/player/web_api/v2/playurl?cid=11090110&appkey=iVGUTjsxvpLeuDCf&otype=json&type=&quality=80&module=bangumi&season_type=1&qn=80&sign=d6d73e8fbbc2adacaf047c48714e8e69";
	if (playUrl.indexOf("http://") == 0) playUrl = playUrl.replace("http://", "https://");
	if (playUrl.indexOf("bilibili") != -1 || !playUrl.split("?cid=")[1]) {
		showError("无效的PlayUrl！");
		$("#playUrl").parent().addClass("has-error has-feedback");
		return null;
	}
	$("#playUrl").parent().removeClass("has-error has-feedback");
	return playUrl;
}

function backupUrl() {
	showError("获取PlayUrl或下载链接出错，请手动输入PlayUrl！否则由于B站限制，只能下载低清晰度视频！");
	$("#backup-url, #error").show();
	$("#playUrl").parent().addClass("has-error has-feedback");
	//$("#success").hide();
	$("#playUrl").val("");
	manual = true;
}

function getAid() {
	if (manual) {
		if (videoUrl != getVideoUrl()) manual = false; //用户在请求playUrl时改变了videoUrl
		else playUrl = getPlayUrl();
	}
	videoUrl = getVideoUrl();
	if (!videoUrl || (manual && !playUrl)) return;

	if (videoUrl.split("av")[1]) {
		aid = videoUrl.split("av")[1].split("/")[0];
		p = videoUrl.split("av")[1].split("?p=")[1] || 1;
		getInfo();
	}
	else {
		$.ajax(videoUrl, {
			type: "get",
			dataType: "text",
			error: function(xhr, status, error) {
				showError("获取视频aid出错！");
			},
			success: function(data, status, xhr) {
				aid = data.split("//www.bilibili.com/video/av")[1].split("/")[0];
				getInfo();
			}
		});
	}
}

function getInfo() {
	$.ajax("https://api.bilibili.com/view?type=jsonp&appkey=8e9fc618fbd41e28&id=" + aid, {
		type: "get",
		dataType: "text",
		error: function(xhr, status, error) {
			showError("获取视频信息出错！");
		},
		success: function(data, status, xhr) {
			//console.log(data);
			data = JSON.parse(data);
			$("tbody").eq(1).html("");
			for (var i in data) {
				if (i == "cid") {
					//cid = data[i];
				}
				if (mime.getType(data[i]) && mime.getType(data[i]).indexOf("image") != -1) { //解析图片地址
					data[i] = '<a href="' + data[i] + '" download=""><img src="' + data[i] + '"></a>';
				}
				$("tbody").eq(1).append(`<tr>
				<td class="capitalize">${i}</td>
				<td>${data[i]}</td>
				</tr>`);
			}
			$.ajax("https://www.bilibili.com/widget/getPageList?aid=" + aid, {
				type: "get",
				dataType: "text",
				error: function(xhr, status, error) {
					showError("获取视频信息出错！");
				},
				success: function(data, status, xhr) {
					data = JSON.parse(data);
					cid = data[p - 1].cid;
					var params = `appkey=iVGUTjsxvpLeuDCf&cid=${cid}&otype=json&qn=112&quality=112&type=`,
						sign = hex_md5(params + "aHRmhWMLkdeMuILqORnYZocwMBpMEOdt");
					playUrl = `http://interface.bilibili.com/v2/playurl?${params}&sign=${sign}`;
					if (manual) {
						playUrl = getPlayUrl();
						if (cid != playUrl.split("?cid=")[1].split("&")[0]) {
							//return; //视频地址和PlayUrl不匹配时结束
							showWarning("视频地址和PlayUrl不匹配，可能造成问题！");
							cid = playUrl.split("?cid=")[1].split("&")[0];
						}
						manual = false;
					}

					if (!cid) {
						showError("获取视频cid出错！");
						return;
					}
					getData(playUrl);
					getDanmaku(); //获取cid后，获取下载链接和弹幕信息
					$("#nav").show();
					if ($(".info").eq(1).is(":hidden")) {
						changeMenu(0);
						//$(".info").eq(0).fadeIn();
					}
				}
			});
		}
	});
}

function getData(url, isBangumi) {
	$.ajax(url, {
		type: "get",
		dataType: "text",
		error: function(xhr, status, error) {
			backupUrl();
		},
		success: function(data, status, xhr) {
			//console.log(url, data);
			var data = isBangumi ? $(data) : JSON.parse(data),
				target = isBangumi ? data.find("durl") : data.durl;
			if (target) {
				var quality = isBangumi ? $(data).find("quality").text() : data.quality,
					qualityArray = {
					112: "高清 1080P+",
					80: "高清 1080P",
					74: "高清 720P60",
					64: "高清 720P",
					48: "高清 720P",
					32: "清晰 480P",
					16: "流畅 360P",
					15: "流畅 360P"
				} //需要修改，不是一一对应
				$("#quality").html(qualityArray[quality] || "未知");
				parseData(target, isBangumi);
			}
			else {
				backupUrl();
				if (isBangumi) return;
				var params = `cid=${cid}&module=movie&player=1&quality=112&ts=1`;
				sign = hex_md5(params + "9b288147e5474dd2aa67085f716c560d");
				getData(`http://bangumi.bilibili.com/player/web_api/playurl?${params}&sign=${sign}`, true);
			}
		}
	});
}

function parseData(target, isBangumi) {
	if (!isBangumi) $("#backup-url, #error").hide();
	$("#success").show();
	$("#cid").html(cid);
	$("tbody").eq(0).html("");
	count = target.length;
	links = [];
	if (isBangumi) target.each(function(i, o) {
		var part = $(o);
		links.push(part.find("url").text());
		$("tbody").eq(0).append(`<tr>
			<td>${part.find("order").text()}</td>
			<td>${part.find("length").text()  / 1e3}</td>
			<td>${part.find("size").text() / 1e6}</td>
			<td>
				<div class="checkbox">
					<label>
				  		<input type="checkbox" checked="true">
					</label>
			  	</div>
			</td>
		</tr>`);
	});
	else for (var i in target) {
		var part = target[i];
		links.push(part.url);
		$("tbody").eq(0).append(`<tr>
			<td>${part.order}</td>
			<td>${part.length / 1e3}</td>
			<td>${part.size / 1e6}</td>
			<td>
				<div class="checkbox">
					<label>
						<input type="checkbox" checked="true">
					</label>
				</div>
			</td>
		</tr>`);
	}
}

function openDialog() {
	var defaultpath = $("#downloadPath").val() || __dirname;
	dialog.showOpenDialog({
		defaultPath: defaultpath,
		properties: [
			"openDirectory", //打开路径
		],
		filters: [
			//{ name: "", extensions: ["json"] },
		]
	}, function(res) {
		if (res[0]) $("#downloadPath").val(res[0]);
	});
}

function download(data) {
	var functionArray = [];
	var flag = true;
	//$("#download").html("");
	for (var i = 0; i < count; i++) {
		if ($('input[type="checkbox"]').eq(i).prop("checked")) {
			if (downloadArray.indexOf(links[i]) != -1) continue;
			$("#download").append(`<span>${cid}-${i}</span>
			&nbsp;&nbsp;&nbsp;
			<span class="addon"></span>
			&nbsp;&nbsp;&nbsp;
			<span class="speed"></span>
			&nbsp;&nbsp;&nbsp;
			<span class="eta"></span>
			<div class="progress progress-striped active">
				<div class="progress-bar progress-bar-info" role="progressbar" style="width: 0%;">
					<span class="progress-value">0%</span>
				</div>
			</div>`);
			let _i = i;
			let _j = downloadIndex; //必须使用let或const
			downloadIndex++;
			downloadArray.push(links[i]);
			ipcRender.send("length", downloadArray.length);
			functionArray.push(function(callback) {
				downloadLink(_i, _j);
				//callback(null, j + " Done");
			});
			flag = false;
		} //由于js执行机制，此处不能直接传值
	}
	if (flag) showWarning("没有新的视频被下载！");
	async.parallel(functionArray, function(err, results) {
		if (err) console.log(err);
	});
}

function openPath() {
	shell.openItem($("#downloadPath").val());
}

function downloadLink(i, j) {
	var downloadPath = $("#downloadPath").val() || "",
		filename = (count > 10 && i <= 9) ? `${cid}-0${i}.flv` : `${cid}-${i}.flv`,
		file = path.join(downloadPath, filename);
	fs.exists(file, function(exist) {
		if (exist) resumeDownload(i, j, file)
		else newDownload(i, j, file);
	});
}

function newDownload(i, j, file) {
	var options = {
		url: links[i],
		encoding: null, //当请求的是二进制文件时，一定要设置
		headers: {
			"Range": "bytes=0-", //断点续传
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1 Safari/605.1.15",
			"Referer": videoUrl
		}
	}
	//console.log(cid, file, options.url);
	var downloads = fs.createWriteStream(file);
	generalDownload(i, j, options, downloads);
}

function resumeDownload(i, j, file) {
	fs.stat(file, function(error, state) {
		var options = {
			url: links[i],
			encoding: null, //当请求的是二进制文件时，一定要设置
			headers: {
				"Range": `bytes=${state.size}-`, //断点续传
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1 Safari/605.1.15",
				"Referer": videoUrl
			}
		}
		$(".addon").eq(j).html(`从${Math.round(state.size / 1e6)}MB处恢复的下载`);
		//console.log(cid, file, options.url);
		var downloads = fs.createWriteStream(file, {"flags": "a"});
		generalDownload(i, j, options, downloads);
	});
}

function generalDownload(i, j, options, downloads) {
	request.get(options).on("response", function(response) {
		//https://blog.csdn.net/zhu_06/article/details/79772229
		var proStream = progress({
			length: response.headers["content-length"],
			time: 500 //单位ms
		});
		proStream.on("progress", function(progress) {
			//console.log(progress);
			$(".speed").eq(j).html(Math.round(progress.speed / 1e3) + "kb/s");
			$(".eta").eq(j).html(`eta:${progress.eta}s`);
			var percentage = progress.percentage; //显示进度条
			$(".progress-value").eq(j).html(Math.round(percentage) + "%");
			$(".progress-bar").eq(j).css("width", percentage + "%");
			if (percentage == 100) {
				$(".progress-bar").eq(j).removeClass("progress-bar-info").addClass("progress-bar-success").parent().removeClass("active");
				downloadArray.splice(downloadArray.indexOf(links[i]), 1);
				ipcRender.send("length", downloadArray.length);
			}
		});
		request.get(options).pipe(proStream).pipe(downloads).on("error", function(e) {
			console.error(e);
		}); //先pipe到proStream再pipe到文件的写入流中
	});
}
